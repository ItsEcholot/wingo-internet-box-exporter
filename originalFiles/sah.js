// MAIN SAH
var SAH = (function() {
    // private SAH data
    var _currentSession = undefined;
    var _currentEvm = undefined;
    var _currentTranslator = undefined;
    var _currentLanguage = "en";
    var _etag_d = undefined;
    var _sessions = {};
    var _eventCallbacks = {};
    var _version = undefined;
    
    return {
        
        //////////////////////////////////////////////////////////////////////////////
        // session management 
        //////////////////////////////////////////////////////////////////////////////
        
        // SAH.currentSession() : 
        //      returns current session or undefined if no current session
        //
        // SAH.currentSession(username: string) : 
        //      sets the current session to the session with the given username or creates a session for the user if it was not existing
        //      returns the session for the given user name
        //
        // SAH.currentSession(session: object) : 
        //      sets the current session to the given session object
        //      returns the session object
        currentSession: function(session) {
            // no argument passed, act as getter
            if (session == undefined) {
                return _currentSession;
            }
            
            function switchSession(session) {
                if (_currentSession == session) {
                    // is already the current session
                    return session;
                }
                // logout the current session
                if (_currentSession != undefined) {
                    _currentSession.logout();
                }
                _currentSession = session;
                return session;
            }
            
            // if an object is given, it should be a session object
            if (session instanceof SAH.Session) {
                return switchSession(session);
            }

            // if a string is provided, it should be a user name
            if (typeof session == "string") {
                if (_sessions[session] != undefined) {
                    // there is a session for that user, set it as the current
                    session = _sessions[session];
                } else {
                    session = new SAH.Session(session);
                }
                return switchSession(session);
            }
                        
            return undefined;
        },

        currentEvm: function(){
            if(_currentEvm == undefined){
                _currentEvm = new SAH.EventManager();
            }
            return _currentEvm;
        },

        currentTranslator: function(){
            if(_currentTranslator == undefined){
                _currentTranslator = new SAH.Translator(_currentLanguage);
            }
            return _currentTranslator;
        },

        loadLanguage: function(lang){
            _currentLanguage = lang;
            _currentTranslator = new SAH.Translator(_currentLanguage);
            if (_eventCallbacks["language_changed"]) {
                _eventCallbacks["language_changed"].fire(_currentTranslator);
            }
        },

        etag: function(){
            if(this._etag_d == undefined){
                this._etag_d = $.Deferred();
                $.get(document.location).done(function(json, textStatus, jqXHR){
                    var etag = jqXHR.getResponseHeader("etag")
                    this._etag_d.resolve(etag);
                }.bind(this));
            }
            return this._etag_d.promise();
        },

        // eventing
        on: function(event, callback) {
            if (_eventCallbacks[event] == undefined) {
                _eventCallbacks[event] = new $.Callbacks();
            }
            _eventCallbacks[event].add(callback);
        },

        off: function(event, callback) {
            if (_eventCallbacks[event] == undefined) {
                return;
            }

            if (callback == undefined) {
                _eventCallbacks[event].empty();
            } else {
                _eventCallbacks[event].remove(callback);
            }
        },

        // SAH.sessions()
        //      returns the list of currently created sessions
        sessions: function() {
            return _sessions;
        },

        // SAH.closeSession()
        //      closes (logout) and removes (delete) the current session, if there is a current session
        //
        // SAH.closeSession(username: string)
        //      closes (logout) and removes (delete) the session for the given user, if it was the current active session, the current active session is reset
        //
        // SAH.closeSession(session: object)
        //      closes (logout) and removes (delete) the session, if it was the current active session, the current active session is reset
        closeSession: function(session) {
            if (session == undefined) {
                if (_currentSession == undefined) {
                    return;
                }
                session = _currentSession;
            }
            
            var name = "";
            // if a string is provided it must be a user name
            if (typeof session == "string") {
                name = session;
            }
            // if a session object is given, take the name out of that object
            if (session instanceof SAH.Session) {
                name = session.userName();
            }
            
            if (_sessions[name] != undefined) {
                if (_sessions[name].userName() == _currentSession.userName()) {
                    _currentSession = undefined;
                }
                delete _sessions[name];
            }
        },
        //////////////////////////////////////////////////////////////////////////////
        
        //////////////////////////////////////////////////////////////////////////////
        // Utility functions
        //////////////////////////////////////////////////////////////////////////////
        
        // SAH.headers()
        //      returns an object with the SAH specific headers, takes into account the current session
        headers: function(idle) {
            var hdr = {"Content-Type":"application/x-sah-ws-4-call+json"};
            if (_currentSession != undefined) {
                _currentSession.checkSession();
                hdr["Authorization"] = "X-Sah " + _currentSession.context();
            }
            if(idle == true){
                hdr["X-Sah-Request-Type"] = "idle";
            }
            return hdr;
        },


        version: function() {
            var deferred = $.Deferred();
            if (_version) {
                deferred.resolve(_version);
                return deferred;
            }

            $.ajax({type: "GET",
                    url: "/version.txt",
                    success: function (data, textStatus, jqXHR) {
                        var version_data = data.split('\n');
                        _version = {};
                        for(var i = 0; i < version_data.length; i++) {
                            var parts = version_data[i].split('=');
                            if (parts[0].length) {
                                _version[parts[0]] = parts[1];
                            }
                        }
                        deferred.resolve(_version);
                    },
                    error: function(data, textStatus, jqXHR ) {
                        deferred.reject();
                    }
                });
            return deferred;
        },

        //////////////////////////////////////////////////////////////////////////////
        
        //////////////////////////////////////////////////////////////////////////////
        // SAH Session class
        //////////////////////////////////////////////////////////////////////////////
        
        // SAH.Session(username: string)
        //     constructor 
        //     creates a new session object for the given user.
        //     when a session is already created for the user, that session is returned
        Session: function(user){
            // private properties
            var _this = this;
            var _context = undefined;
            var _sessid = undefined;
            var _etag = undefined;
            var _groups = undefined;
            var _user_name = user;
            var _open = false;
            var _active = $.Deferred();
            var _keepalive = true;

            // check if there is already a session for the user
            if (_sessions[_user_name] != undefined) {
                return _sessions[_user_name];
            }
            // add to the sessions list
            _sessions[_user_name] = _this;

            // get context from cookie
            $.cookie.raw = true;

            // restore the session for <user> based on sessid and context cookies
            _this.restore = function(){
                var deferred = $.Deferred();
                var obj = new SAH.Object("HTTPService");

                $.when(SAH.etag()).then(function(etag){
                  // make invoke() temporarily use the current session and context cookie
                  SAH.currentSession(_this); 
                  _context = $.cookie(etag+'/context');

                  $.when(obj.invoke("getCurrentUser"))
                   .then(function(data){
                      if( (user && (data.user == user)) ||
                          (!user && (data.user != 'anonymous')) ){
                          if(_context == undefined){
                              _context = $.cookie(etag+'/context');
                          }
                          if(!user) _user_name = data.user;
                          $.cookie(etag+'/login', _user_name, {path: '/'});
                          _sessid = $.cookie(etag+'/sessid');
                          _etag = etag;
                          _groups = data.groups;
                          _open = true;
                          SAH.currentSession(_this);
                          _this.setKeepAlive(_keepalive);
                          deferred.resolve();
                      }else{
                          deferred.reject(data);
                      }
                   },function(data, textStatus, jqXHR){
                      deferred.reject(data);
                   });

                  // reset temporary session and context while awaiting invoke() response
                  SAH.currentSession(undefined);  
                  _context = undefined;
                });


                return deferred.promise();
            };

            _this.login = function(pass){
                var data = {
                    "service":"sah.Device.Information",
                    "method":"createContext",
                    "parameters": { 
                        applicationName:"webui",
                        username:_user_name,
                        password:pass
                    }
                };
                
                // log out current session
                if (SAH.currentSession() != undefined) {
                    SAH.currentSession().logout();
                }
                
                var deferred = $.Deferred();
                $.ajax({ 
                    type: "POST",
                    url: "/ws",
                    headers: { 
                        "Content-Type":"application/x-sah-ws-4-call+json",
                        "Authorization":"X-Sah-Login"
                    },
                    data: JSON.stringify(data),
                    success: function (json, textStatus, jqXHR) {
                        if(json.data){
                            _context = json.data.contextID;
                            SAH.etag().done(function(etag){
                                $.cookie(etag+'/context', _context, {path: '/'});
                                _sessid = $.cookie(etag+'/sessid');
                                // required to make old configurator detect the username:
                                $.cookie(etag+'/login', _user_name, {path: '/'});
                                _etag = etag;
                            });
                            _groups = json.data.groups.split(",");
                            _open = true;
                            SAH.currentSession(_this);
                            _this.setKeepAlive(_keepalive);
                            deferred.resolve(json);
                            _active.resolve();
                        } else {
                            deferred.reject(json);
                        }
                    },
                    error: function(data, textStatus, jqXHR ) {
                        deferred.reject();
                    }
                });
                return deferred.promise();
            };

            _this.logout = function(){
                var deferred = $.Deferred();
                if (!_this.isOpen()) {
                    deferred.resolve({});
                    return deferred.promise();
                }
                var data = {
                    "service":"sah.Device.Information",
                    "method":"releaseContext",
                    "parameters": { 
                        applicationName:"webui"
                    }
                };
                $.ajax({ 
                    type: "POST",
                    url: "/ws",
                    headers: { 
                        "Content-Type":"application/x-sah-ws-4-call+json",
                        "Authorization":"X-Sah-Logout " + _context
                    },
                    data: JSON.stringify(data),
                    complete: function (json) {
                        _context = undefined;
                        _sessid = undefined;
                        if(_etag){
                            $.removeCookie(_etag+'/context', { path: '/' });
                            $.removeCookie(_etag+'/login', { path: '/' });
                        }
                        _groups = undefined;
                        _open = false;
                        deferred.resolve(json);
                    }
                });
                return deferred.promise();
            };

            _this.context = function() {
                return _context;
            };

            _this.isOpen = function() {
                return _open;
            };

            _this.isAvailable = function(){
                return _active.promise();
            };

            _this.userName = function() {
                return _user_name;
            };

            /*
             * Set whether this session should be kept alive, or time out after 10 minutes of inactivity.
             * By default, the session is kept alive (through the event channel).
             * If a timeout is detected, a session_timeout event will be sent.
             */
            _this.setKeepAlive = function(enable){
                _keepalive = enable;
                if(enable){
                    if(_timeout_timer){
                        clearTimeout(_timeout_timer);
                        _timeout_timer = undefined;
                    }
                }else{
                    if(!_timeout_timer)
                        pollForTimeout();
                }
            };

            _this.hasKeepAliveEnabled = function(){
                return _keepalive;
            };

            /* Check whether someone else overwrote the sessid cookie.
             * If overwritten, send a session_hijacked event.
             */
            _this.checkSession = function() {
                var sessid_cookie = $.cookie(_etag+'/sessid');
                if(_etag && _sessid && _sessid != sessid_cookie){
                    if( !_timeout_timer || sessid_cookie){
                        _sessid = undefined;
                        console.warn("session hijacked!");
                        if (_eventCallbacks["session_hijacked"]) {
                            _eventCallbacks["session_hijacked"].fire();
                        }
                    }
                }
            };

            var _timeout_timer = undefined;
            /* Check whether session has timed out at server side every 10s.
             * If it has timed out, send clean up the session, and send an session_timeout event.
             */
            var pollForTimeout = function(){
                _timeout_timer = setTimeout(function(){
                    var obj = new SAH.Object();
                    $.when(obj.invoke("HTTPService","getCurrentUser",{},true))
                     .then(function(data){
                        if(_user_name){
                           if(data.user == _user_name){
                               pollForTimeout();
                           }else{
                               handleTimeout();
                           }
                        }
                    },function(s,d,e){
                        handleTimeout();
                    });
                }, 10000);
                var handleTimeout = function(){
                   _timeout_timer = undefined;
                   if(_sessid){
                       _context = undefined;
                       _sessid = undefined;
                       if(_etag){
                           $.removeCookie(_etag+'/context', { path: '/' });
                           $.removeCookie(_etag+'/login', { path: '/' });
                           $.removeCookie(_etag+'/sessid', { path: '/' });
                       }
                       _groups = undefined;
                       _open = false;

                       console.warn("session timed out!");
                       if (_eventCallbacks["session_timeout"])
                           _eventCallbacks["session_timeout"].fire();
                    }
                }
            };

        },
        //////////////////////////////////////////////////////////////////////////////
        
        //////////////////////////////////////////////////////////////////////////////
        // SAH Event Manager class
        //////////////////////////////////////////////////////////////////////////////
        
        // Handle events for one session

        // SAH.EventManager()
        //     constructor 
        //     creates a new event manager for the current session
        //     and opens the event channel
        EventManager: function(){
            var subscriptions = {};

            this.subscribe = function(service, event, cb){
                if(!service || !event || !cb) {
                    return;
                }
                if(!subscriptions[service]) {
                    subscriptions[service] = {};
                }
                if(!subscriptions[service][event]) {
                    subscriptions[service][event]=[];
                }

                subscriptions[service][event].push(cb);
                if(subscriptions[service][event].length == 1) {
                    reopenEventChannel();
                }
            };

            this.unsubscribe = function(service, event, cb){
                var subs = subscriptions[service][event];
                if(subs){
                    for(var i=0; i<subs.length; i++){
                        if(subs[i] == cb){
                            subs.splice(i,1);
                            if(subs.length == 0) {
                                reopenEventChannel();
                            }
                            break;
                        }
                    }
                }
            };

            this.trigger = function(events){
                for (var k=0; k<events.length; k++){
                    var ev = events[k].data;
                    var service = ev.handler;
                    var event = ev.object.reason;
                    var servicelist = service.split(".");
                    var subservice = '';
                    for(var i=0; i<servicelist.length; i++){
                        subservice+=servicelist[i];
                        var s = subscriptions[subservice];
                        if(s && s[event]){
                            for (var j=0; j<s[event].length; j++){
                                s[event][j](ev);
                            }
                        }
                        subservice+='.';
                    }
                }
            };

            var eventparams = {"service":"eventmanager",
                               "method":"get_events",
                               "parameters":{"channelid":0,
                                             "events":[]}
                               };
            var latestChannel = 0;
            var timer = null;

            // delay event channel opening with max 100ms
            // to prevent many open channel connections at once
            var reopenEventChannel = function(){
                if(timer == null){
                    timer = setTimeout(function(){openEventChannel(0);},100);
                }
            };

            var openEventChannel = function(chan){
                timer = null;
                latestChannel++;
                eventparams.parameters.channelid = chan;
                eventparams.parameters.events = getEventList();
                var idleflag = false;
                if(SAH.currentSession()){
                    idleflag = !SAH.currentSession().hasKeepAliveEnabled();
                }
                $.ajax({ type: "POST",
                     url: "/ws",
                     headers: SAH.headers(idleflag),
                     data: JSON.stringify(eventparams),
                }).done(
                    function(lc, json){
                        if(latestChannel == lc){
                            var chan = (json && json.status? json.status.channelid : 0);
                            openEventChannel(chan);
                        }
                        if(json.status){
                            this.trigger(json.status.events);
                        }else{
                            console.warn('invalid event reply');
                        }
                    }.bind(this, latestChannel)
                ).fail(
                    function(lc, json, textStatus, jqXHR){
                        if(latestChannel == lc){
                            if(textStatus == "parsererror"){
                                // HACK: don't consider the badly formatted 'unable to create channel' error
                                // as a connection failure, just silently retry
                                console.warn('unable to create event channel, retrying...');
                                setTimeout(function(){openEventChannel(0);},1000);
                            }else{
                                handleConnectionDown(json);
                            }
                        }
                    }.bind(this, latestChannel)
                );
            }.bind(this);

            var getEventList = function(){
                var evlist = [];
                for(var s in subscriptions){
                    if(subscriptions.hasOwnProperty(s)){
                        for (var e in subscriptions[s]){
                             if(subscriptions[s].hasOwnProperty(e) && subscriptions[s][e].length>0){
                                 evlist.push({service: s, event: e});
                             }
                        }
                    }
                }
                return evlist;
            };

            var timer = undefined;

            // connection down, but trying to recover
            var handleConnectionDown = function(json){
                if(timer) return;

                console.warn('connection lost! retrying in 10s...');
                if (_eventCallbacks["connection_down"]) {
                    _eventCallbacks["connection_down"].fire();
                }
                timer = setTimeout(function(){
                    var session = SAH.currentSession();
                    if(session){
                        session.restore().done(function(){
                            handleConnectionRestored();
                            var chan = (json && json.status? json.status.channelid : 0);
                            openEventChannel(chan);
                        }).fail(function(data){
                            if(data === -1){ // cannot not connect to restore
                                handleConnectionDown();
                            }else{ // session does not exist on the server
                                handleSessionLost();
                            }
                        });
                    }else{
                        handleSessionLost();
                    }
                    timer = undefined;
                },10000);
            };

            // connection back active but session lost permanently
            //   (session is gone because server has rebooted, or session has timed out)
            var handleSessionLost = function(){
                console.warn('connection is back, but could not restore session!');
                if (_eventCallbacks["session_lost"]) {
                    _eventCallbacks["session_lost"].fire();
                }
            };

            // connection restored
            var handleConnectionRestored = function(){
                console.log('connection restored!');
                if (_eventCallbacks["connection_restored"]) {
                    _eventCallbacks["connection_restored"].fire();
                }
            };

            openEventChannel(0);
        },

        // SAH Object class
        ///////////////////////////////////////////////////////////////////////////
        Object: function(service) {
            var _this = this;
            
            _this._loaded = false;
            _this.service = service || "";
            _this.subscriptions = {};
        },
        
        // 
        ///////////////////////////////////////////////////////////////////////////
        DMObject: function(service) {
            var _this = this;
            // call constructor of SAH.Object
            SAH.Object.call(_this, service);
            _this.load();
        },

        // SAH Function class
        ///////////////////////////////////////////////////////////////////////////
        Function: function(object, function_def) {
            var _this = this;
            _this.name = function_def.name;
            _this.type = function_def.type;
            _this.arguments = function_def.arguments || [];
            if (object instanceof SAH.Object) {
                _this.object = object;
            }
        },

        // SAH Parameter class
        ///////////////////////////////////////////////////////////////////////////
        Parameter: function(object, parameter_def) {
            var _this = this;
            _this.name = parameter_def.name;
            _this.type = parameter_def.type;
            _this.value = parameter_def.value;
            if (object instanceof SAH.Object) {
                _this.object = object;
            }
        },

        //////////////////////////////////////////////////////////////////////////////
        // SAH Translator class
        //////////////////////////////////////////////////////////////////////////////
        
        // Fill in a text in all tags with a "translate" attribute.

        // SAH.Translator(language)
        //     constructor 
        //     creates a new translator with the specified language
        //          matching a file lang/<language>.json
        Translator: function(lang){
            var self = this;
            var _lang = lang;
            var _dictionary={};
            var loaded = $.Deferred();
            this.load = function(language){
                SAH.etag().done(function(etag){
                    $.getJSON("lang/"+language+".json"+"?"+etag)
                    .done(function (json, textStatus, jqXHR) {
                        $.each( json, function( key, value ) {
                            _dictionary[key] = value;
                        });
                        loaded.resolve();
                    })
                    .fail(function(data, textStatus, jqXHR) {
                        console.error("Language file error: "+textStatus);
                        loaded.reject();
                    });
                });
            };

            this.loadJson = function(json){
                $.each( json, function( key, value ) {
                    _dictionary[key] = value;
                });
                loaded.resolve();
            }

            this.isLoaded = function(){
                return loaded;
            };

            // create jquery "translate" plugin
            $.fn.translate = function(textid){
                this.attr("translate",textid)
                    .html(self.lookup(textid));
                return this;
            };

            if(lang != undefined){
                this.load(lang);
            }

            // Find a string matching with the given text id in the current language
            // Translator has to be finished loading before using this function (check with isLoaded().done)
            this.lookup = function(id){
                var ids = id.split(".");
                var tr = _dictionary;
                for (var i=0; i<ids.length; i++){
                    tr = tr[ids[i]];
                    if(tr == undefined){
                        // if no match, return the id.
                        tr = id;
                        break;
                    }
                }
                return tr;
            };

            this.lookup_lc = function(id){
               return this.lookup(id).toLowerCase();
            };

            this.run = function(el){
                var self = this;
                var deferred = $.Deferred();
                if(el == undefined){
                    el = $("body");
                }
                loaded.done(function(){
                    $.map($(el), function(obj){
                        if($(obj).attr("translate") !== undefined){
                            var str = self.lookup($(obj).attr("translate"));
                            $(obj).html(str);
                        }else{
                            $(obj).find("[translate]").each(function(){
                                var str = self.lookup($(this).attr("translate"));
                                $(this).html(str);
                            });
                        }
                    });
                    deferred.resolve();
                });
                return deferred.promise();
            };

            this.add = function(group, translations) {
                _dictionary[group] = translations;
            }

            this.currentLanguage = function(){
                return _lang;
            };

            this.getCookieLanguage = function(){
                var lang_d = $.Deferred();
                var lang = undefined;
                $.cookie.raw = true;
                etag().done(function(etag){
                    lang = $.cookie(etag+'/language');
                    lang_d.resolve(lang);
                });
                return lang_d;
            };

        }
        
    }

} ());

// SAH Object prototype functions
///////////////////////////////////////////////////////////////////////////
// invoke(method [, args])
// invoke(service, method [, args]);
// invoke(service, method [, args, idleflag]);
///////////////////////////////////////////////////////////////////////////
SAH.Object.prototype.invoke = function() {
    var deferred = $.Deferred();

    var service = this.service;
    var method = "";
    var args = {};
    var idle = false;

    // check the arguments
    var arg_array = Array.prototype.slice.call(arguments, 0, arguments.length);
    switch(arg_array.length) {
        case 0:
            var errors = [{ error: 404, description: "Not found", info:"" }];
            deferred.reject(errors);
            return deferred.promise();
        break;
        case 1: // only method without arguments
            method = arg_array[0];
        break;
        case 2: // method with arguments or service and method, no arguments
            if ($.isPlainObject(arg_array[1])) {
                method = arg_array[0];
                args = arg_array[1];
            } else {
                service = arg_array[0];
                method = arg_array[1];
            }
        break;
        case 3: // service, method and arguments
            service = arg_array[0];
            method = arg_array[1];
            args = arg_array[2];
        break;
        case 4: // service, method, arguments and idle flag
            service = arg_array[0];
            method = arg_array[1];
            args = arg_array[2];
            idle = arg_array[3];
        break;
    }
    data = {"service": service, "method": method, "parameters": args};

    var deferred = $.Deferred();
    // do the call using ajax
    $.ajax({ 
        type: "POST",
        url: "/ws",
        headers: SAH.headers(idle),
        data: JSON.stringify(data),
        success: function(json) {
            if (typeof json == "undefined" || json == null) {
                deferred.reject(-1, {}, [{"error":-1,"description":"Unknown error","info":""}]);
            }
            var status = json.status || 0;
            var data = json.data || {};
            var errors = json.errors || [];
            if (errors.length == 0) {
                // all ok, resolve the promise
                deferred.resolve(status, data, errors);
            } else {
                // errors in the list, reject the promise
                deferred.reject(status, data, errors)
            }
        },
        error: function(jqXHR, textStatus) {
            // reject the promise
            var errors = [ { error: jqXHR.status, description: jqXHR.statusText, info:"" }];
            deferred.reject(-1, {}, errors);
        }
    });
    return deferred.promise();
}

SAH.Object.prototype.inspect = function(service) {
    var _this = this;
    service = service || _this.service;
    var deferred = $.Deferred();
    var slash_path = service.replace(/\./g,"/");
    var url = "/ws/" + slash_path + "?_restAttributes=noObject_template_info&_restDepth=0"
    
    $.ajax({ 
        type: "GET",
        url: url,
        headers: SAH.headers(),
        success: function(json) {
            if (json.error) {
                var errors= [];
                errors.push(json);
                deferred.reject(errors);
                return;
            }

            var object_functions = json.functions || [];
            var object_children = json.children || [];
            var object_instances = json.instances || [];
            var object_parameters = json.parameters || [];
            var info = json.objectInfo.attributes || {};
            var functions = [];
            var objects = [];
            var parameters = [];
            for(var i = 0; i < object_functions.length; i++) {
                functions.push(new SAH.Function(service, object_functions[i]));
            }
            for(var i = 0; i < object_children.length; i++) {
                var child = object_children[i].objectInfo.key;
                objects.push(child);
            }
            for(var i = 0; i < object_instances.length; i++) {
                var child = object_instances[i].objectInfo.key;
                objects.push(child);
            }
            for(var i = 0; i < object_parameters.length; i++) {
                parameters.push(new SAH.Parameter(service, object_parameters[i]));
            }
            deferred.resolve(service, functions, objects, parameters, info);
        },
        error: function(jqXHR, textStatus) {
            var errors = [];
            if (jqXHR.status == 200) {
                var pos = jqXHR.responseText.indexOf('[');
                if (pos != -1) {
                    var data = jqXHR.responseText.substring(pos);
                    var extra_errors = JSON.parse(data);
                    errors.push.apply(errors, extra_errors);
                }
            } else {
                errors = [ { error: jqXHR.status, description: jqXHR.statusText, info:"" }];
            }

            deferred.reject(errors);
        }
    });
    return deferred.promise();
}

SAH.Object.prototype.load = function() {
    var _this = this;
    var deferred = $.Deferred();
    _this.inspect().then(
        function(service, functions, objects) {
            for(var i = 0; i < functions.length; i++) {
                if (_this[functions[i].name] != undefined) {
                    // function already defined
                    continue;
                }
                _this[functions[i].name] = function() {
                    var _this = this;
                    var arg_array = Array.prototype.slice.call(arguments, 0, arguments.length);
                    var pcb_arg = {};
                    for (var i = 0; i < arguments.callee.func_def.arguments.length; i++) {
                        if (i < arg_array.length) {
                            pcb_arg[arguments.callee.func_def.arguments[i].name] = arg_array[i];
                        } else {
                            break;
                        }
                    }
                    return _this.invoke(_this.service, arguments.callee.func_def.name,pcb_arg);
                }
                _this[functions[i].name].func_def = functions[i];
            }
            // mark loaded and resolve the promise
            _this.loaded = true;
            deferred.resolve(_this);
        },
        function(errors) {
            deferred.reject(errors);
        }
    );
    return deferred.promise();    
}

SAH.Object.prototype.isLoaded = function() {
    return this._loaded;
}

SAH.Object.prototype.isAvailable = function() {
    var _this = this;
    var deferred = $.Deferred();
    
    if (_this.loaded) {
        deferred.resolve(_this);
        return deferred.promise();
    } else {
        return _this.load();
    }
}

///////////////////////////////////////////////////////////////////////////
// set( {parameter1:value1, parameter2:value2, ..., parametern:valuen} )
// set(service, {parameter1:value1, parameter2:value2, ..., parametern:valuen} )
// set(parameter, value)
// set(service, parameter, value);
///////////////////////////////////////////////////////////////////////////
SAH.Object.prototype.set = function() {
    var _this = this;
    var service = _this.service;
    var parameter = undefined;
    var value = undefined;
    var data = {};

    // check the arguments
    var arg_array = Array.prototype.slice.call(arguments, 0, arguments.length);
    switch(arg_array.length) {
        case 0: // invalid nr of arguments
            return;
        break;
        case 1: // object containing parameter value pairs
            data = arg_array[0];
        break;
        case 2: // parameter value or service object
            if (typeof arg_array[1] == "object") {
                service = arg_array[0];
                data = arg_array[1];
            } else {
                data[arg_array[0]] = arg_array[1];
            }
        break;
        case 3: // service, parameter, value
            service = arg_array[0];
            data[arg_array[1]] = arg_array[2];
        break;
    }

    var deferred = $.Deferred();
    var slash_path = service.replace(/\./g,"/");
    var url = "/ws/" + slash_path;

    $.ajax({
        type: "PUT",
        url: url,
        data: JSON.stringify(data),
        headers: SAH.headers(),
        success: function(json) {
            var object_parameters = json.parameters || [];
            var parameters = [];
            for(var i = 0; i < object_parameters.length; i++) {
                parameters[object_parameters[i].name]=object_parameters[i].value;
            }
            deferred.resolve(parameters);
        },
        error: function(jqXHR, textStatus) {
            var errors = [];
            if (jqXHR.status == 200) {
                var pos = jqXHR.responseText.indexOf('[');
                if (pos != -1) {
                    var data = jqXHR.responseText.substring(pos);
                    var extra_errors = JSON.parse(data);
                    errors.push.apply(errors, extra_errors);
                }
            } else {
                errors = [ { error: jqXHR.status, description: jqXHR.statusText, info:"" }];
            }

            deferred.reject(errors);
        }
    });

    return deferred.promise();
}

///////////////////////////////////////////////////////////////////////////
// get()
// get(service)
///////////////////////////////////////////////////////////////////////////
SAH.Object.prototype.get = function() {
    var _this = this;
    var service = _this.service;

    // check the arguments
    var arg_array = Array.prototype.slice.call(arguments, 0, arguments.length);
    switch(arg_array.length) {
        case 0:
        break;
        case 1: // object containing parameter value pairs
            service = arg_array[0];
        break;
        default:
            service = arg_array[0];
        break;
    }

    var deferred = $.Deferred();
    var slash_path = service.replace(/\./g,"/");
    var url = "/ws/" + slash_path + "?_restAttributes=noObject_template_info,noObject_instances,noObject_children,noObject_functions&_restDepth=0"

    $.ajax({
        type: "GET",
        url: url,
        headers: SAH.headers(),
        success: function(json) {
            var object_parameters = json.parameters || [];
            var parameters = {};
            for(var i = 0; i < object_parameters.length; i++) {
                parameters[object_parameters[i].name]=object_parameters[i].value;
            }
            deferred.resolve(parameters);
        },
        error: function(jqXHR, textStatus) {
            var errors = [];
            if (jqXHR.status == 200) {
                var pos = jqXHR.responseText.indexOf('[');
                if (pos != -1) {
                    var data = jqXHR.responseText.substring(pos);
                    var extra_errors = JSON.parse(data);
                    errors.push.apply(errors, extra_errors);
                }
            } else {
                errors = [ { error: jqXHR.status, description: jqXHR.statusText, info:"" }];
            }

            deferred.reject(errors);
        }
    });

    return deferred.promise();
}

///////////////////////////////////////////////////////////////////////////
// addInstance()
// addInstance(service)
// addInstance( {parameter1:value1, parameter2:value2, ..., parametern:valuen} )
// addInstance(service, {parameter1:value1, parameter2:value2, ..., parametern:valuen} )
// addInstance(parameter, value)
// addInstance(service, parameter, value);
///////////////////////////////////////////////////////////////////////////
SAH.Object.prototype.addInstance = function() {
    var _this = this;
    var service = _this.service;
    var parameter = undefined;
    var value = undefined;
    var data = {};

    // check the arguments
    var arg_array = Array.prototype.slice.call(arguments, 0, arguments.length);
    switch(arg_array.length) {
        case 0:
        break;
        case 1: // object containing parameter value pairs or service object
            if ($.isPlainObject(arg_array[0])) {
                data = arg_array[0];
            } else {
                service = arg_array[0];
            }
        break;
        case 2: // parameter & value or service object & object containint parameter value pairs
            if ($.isPlainObject(arg_array[1])) {
                service = arg_array[0];
                data = arg_array[1];
            } else {
                data[arg_array[0]] = arg_array[1];
            }
        break;
        case 3: // service, parameter, value
            service = arg_array[0];
            data[arg_array[1]] = arg_array[2];
        break;
    }

    var deferred = $.Deferred();
    var slash_path = service.replace(/\./g,"/");
    var url = "/ws/" + slash_path;
    var hdrs = SAH.headers();
    hdrs["Content-Type"] = "application/json"; // change the content type, otherwise it is an execute function

    $.ajax({
        type: "POST",
        url: url,
        data: JSON.stringify(data),
        headers: hdrs,
        success: function(json) {
            var object_parameters = json.parameters || [];
            var parameters = [];
            for(var i = 0; i < object_parameters.length; i++) {
                parameters[object_parameters[i].name]=object_parameters[i].value;
            }
            deferred.resolve(parameters);
        },
        error: function(jqXHR, textStatus) {
            var errors = [];
            if (jqXHR.status == 200) {
                var pos = jqXHR.responseText.indexOf('[');
                if (pos != -1) {
                    var data = jqXHR.responseText.substring(pos);
                    var extra_errors = JSON.parse(data);
                    errors.push.apply(errors, extra_errors);
                }
            } else {
                errors = [ { error: jqXHR.status, description: jqXHR.statusText, info:"" }];
            }

            deferred.reject(errors);
        }
    });

    return deferred.promise();
}

///////////////////////////////////////////////////////////////////////////
// deleteInstance()
// deleteInstance(service)
///////////////////////////////////////////////////////////////////////////
SAH.Object.prototype.deleteInstance = function() {
    var _this = this;
    var service = _this.service;

    // check the arguments
    var arg_array = Array.prototype.slice.call(arguments, 0, arguments.length);
    switch(arg_array.length) {
        case 0:
        break;
        case 1: // service object
            service = arg_array[0];
        break;
    }

    var deferred = $.Deferred();
    var slash_path = service.replace(/\./g,"/");
    var url = "/ws/" + slash_path;

    $.ajax({
        type: "DELETE",
        url: url,
        data: JSON.stringify(data),
        headers: SAH.headers(),
        success: function(json) {
            deferred.resolve();
        },
        error: function(jqXHR, textStatus) {
            var errors = [];
            if (jqXHR.status == 200) {
                var pos = jqXHR.responseText.indexOf('[');
                if (pos != -1) {
                    var data = jqXHR.responseText.substring(pos);
                    var extra_errors = JSON.parse(data);
                    errors.push.apply(errors, extra_errors);
                }
            } else {
                errors = [ { error: jqXHR.status, description: jqXHR.statusText, info:"" }];
            }

            deferred.reject(errors);
        }
    });

    return deferred.promise();
}

// subscribe(service, event, cb)
// subscribe(event, cb);
//
//           typical values for <event> are "add", "delete", "changed"
SAH.Object.prototype.subscribe = function() {
    var service = this.service;
    var event = undefined;
    var cb = undefined;

    // check the arguments
    var arg_array = Array.prototype.slice.call(arguments, 0, arguments.length);
    switch(arg_array.length) {
        case 0: // invalid nr of arguments
        case 1:
            return;
        break;
        case 2: // must be event and cb
            event = arg_array[0];
            cb = arg_array[1];
        break;
        case 3: // service, event and cb
            if (service.length == 0) {
                service = arg_array[0];
            } else {
                service += '.' + arg_array[0];
            }
            event = arg_array[1];
            cb = arg_array[2];
        break;
    }

    if(service.length == 0 || !event || !cb) {
        // invalid arguments
        return;
    }

    if(!this.subscriptions[service]) {
        this.subscriptions[service] = {};
    }
    if(!this.subscriptions[service][event]) {
        this.subscriptions[service][event]=[];
    }
    
    this.subscriptions[service][event].push(cb);

    SAH.currentEvm().subscribe(service,event,cb);
}

// unsubscribe(service, event, cb)
// unsubscribe(event, cb)
// unsubscribe()  -- unsubscribe from all event subscriptions added to this object
SAH.Object.prototype.unsubscribe = function() {
    if(arguments.length == 0){
        for(var s in this.subscriptions){
            if(this.subscriptions.hasOwnProperty(s)){
                for (var e in this.subscriptions[s]){
                     if(this.subscriptions[s].hasOwnProperty(e)){
                         var subs = this.subscriptions[s][e];
                         for(var i=0; i<subs.length; i++)
                             SAH.currentEvm().unsubscribe(s,e,subs[i]);
                     }
                }
            }
        }
    }else{
        var service = this.service;
        var event = undefined;
        var cb = undefined;
        
        // check the arguments
        var arg_array = Array.prototype.slice.call(arguments, 0, arguments.length);
        switch(arg_array.length) {
            case 1: // invalid nr of arguments
                return;
                break;
            case 2: // must be event and cb
                event = arg_array[0];
                cb = arg_array[1];
                break;
            case 3: // service, method and arguments
                if (service.length == 0) {
                    service = arg_array[0];
                } else {
                    service += '.' + arg_array[0];
                }
                method = arg_array[1];
                args = arg_array[2];
                break;
        }
        if (service.length) {
            service = arg_array[0];
        } else {
            service += '.' + arg_array[0];
        }
        SAH.currentEvm().unsubscribe(service,event,cb);
    }
}


// SAH Function prototype functions
///////////////////////////////////////////////////////////////////////////
SAH.Function.prototype.toString = function() {
    var fn = this.name + "(";
    var separator = "";
    for(var i = 0; i < this.arguments.length; i++) {
        fn = fn + separator + this.arguments[i].name + ":" + this.arguments[i].type;
        separator = ", ";
    }
    fn = fn + "):" + this.type;
    return fn;
}

// SAH Function prototype functions
///////////////////////////////////////////////////////////////////////////
SAH.Parameter.prototype.toString = function() {
    var parameter = this.name + "=" + this.value;
    return parameter;
}

// SAH Device prototype functions
///////////////////////////////////////////////////////////////////////////
// inherit from SAH.DMObject
SAH.DMObject.prototype = Object.create(SAH.Object.prototype);

