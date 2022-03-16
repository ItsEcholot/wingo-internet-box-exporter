var troubleshooting = {
   en: {
       dsl:{
           1:"Connect the grey DSL cable with the TT83 Adapter and your phone socket.",
           2:"Connect the grey DSL cable to the grey DSL port of the Box.",
           3:"Power-on the Box and wait for about 5 minutes until the LED turns white."
       },
       fiber:{
           1:"Connect the green side of the fiber cable to the wall socket.",
           2:"Connect the blue side of the fiber cable to the fiber port of the Box.",
           3:"Power-on the Box and wait for about 5 minutes until the LED turns white."
       },
       internet:{
           1:"Line connected – Waiting for IP Address"
       },
       phone:{
           1:"Connect your phone to the black phone port of the Box.",
           2:"Power-on the Box and wait for about 2 minutes until the LED turns white.",
           3:"Try to make a phone call."
       },
       wireless:{
           1:'Press the "wifi" button on the top right of the Box for more then 5 seconds to activate Wireless'
       }
   },
   fr: {
       dsl:{
           1:"Connectez le câble DSL gris à l'adaptateur TT83 puis à la prise du téléphone.",
           2:"Connectez l'autre embout du câble DSL gris au port DSL gris de la Box.",
           3:"Mettez la Box sous tension et attendez environ cinq minutes jusqu` à ce que le voyant passe au blanc."
       },
       fiber:{
           1:"Connectez le coté vert du câble optique à votre prise murale.",
           2:"Connectez le coté bleu du câble optique au port fibre de votre Box.",
           3:"Mettez la Box sous tension et attendez environ cinq minutes jusqu` à ce que le voyant passe au blanc."
       },
       internet:{
           1:"Connection établie, en attente d’une adresse IP"
       },
       phone:{
           1:"Connectez votre téléphone au port téléphonique noir de la Box.",
           2:"Mettez la Box sous tension et attendez environ cinq minutes jusqu'à ce que le voyant sur la Box passe au blanc.",
           3:"Essayez de passer un appel téléphonique."
       },
       wireless:{
           1:'Appuyez sur le bouton "wifi" sur l\'angle de la Box pendant plus de 5 secondes pour activer le Wi-Fi'
       }
   },
   de:{
       dsl:{
           1:"Schliessen Sie das graue DSL-Kabel an den TT83 Adapter und an Ihre Telefonsteckdose an.",
           2:"Schliessen Sie das andere Ende des grauen DSL-Kabels an den grauen DSL-Port der Box an.",
           3:"Schalten Sie die Box ein und warten Sie ungefähr fünf Minuten, bis die LED weiss leuchtet."
       },
       fiber:{
           1:"Schliessen Sie das grüne Ende des glasfaser kabels an Ihre Glasfasersteckdose an.",
           2:"Schliessen Sie das blaue Ende des glasfaser kabels an den optische Port der Box an.",
           3:"Schalten Sie die Box ein und warten Sie ungefähr fünf Minuten, bis die LED weiss leuchtet."
       },
       internet:{
           1:'Verbindung gemacht, wartet auf eine IP-Adresse'
       },
       phone:{
           1:"Schliessen Sie Ihr Telefon an den schwarzen Telefon-Port der Box an.",
           2:"Schalten Sie die Box ein und warten Sie ungefähr fünf Minuten, bis die LED weiss leuchtet.",
           3:"Versuchen Sie einen Anruf zu tätigen."
       },
       wireless:{
           1:'Bitte drücken Sie die "Wi-Fi" Taste für mehr als 5 Sekundem um Wi-Fi einzuschalten'
       }
   },
   it:{
       dsl:{
           1:"Collegate il cavo DSL grigio all'adattatore TT83 e alla presa del telefono.",
           2:"Collegate il cavo DSL grigio alla porta DSL della Box.",
           3:"Accendete la Box e attendete all'incirca 5 minuti fino a quando il LED passa al bianco."
       },
       fiber:{
           1:"Collegate il lato verde del cavo fibra alla presa a muro.",
           2:"Collegate il lato blue del cavo fibra alla porta della Box.",
           3:"Accendete la Box e attendete all'incirca 5 minuti fino a quando il LED passa al bianco."
       },
       internet:{
           1:'Connessione finito, in attesa di un indirizzo IP'
       },
       phone:{
           1:"Collegate il vostro telefono alla porta telefonica nera della Box.",
           2:"Accendete la Box e attendete all'incirca 5 minuti fino a quando il LED passa al bianco.",
           3:"Provate a fare una telefonata."
       },
       wireless:{
           1:'Presse "wifi" per più di 5 secondi per attivare il wifi'
       }

   }
};


(function(){

   var translator;
   var lang = "en";

   var hgw;
   var wl0;
   var dsl0;
   var eth0 = {};
   var trunks;
   var nmc;
   var service_status = {};

   $( function(){
       translator = new SAH.Translator();
       translator.loadJson(troubleshooting[lang]);

       getData().done(function(){
           displayBoxes();
       }).fail(function(){
           $('.content').eq(0).html("<h2>Error: could not retrieve data from box...</h2>");
       });

       setInterval(function(){
            getData().done(function(){
                $(".value").trigger("update");
                showDefaultPage();
            });
       },10000);
   });


function getData(){
    var deferred = $.Deferred();
    var obj = new SAH.Object();
    var p = [];

    p.push(obj.invoke("Devices.Device.HGW","get",{}).done(function(res){
        hgw = res;
    }));
    p.push(obj.invoke("Devices.Device.wl0","get",{}).done(function(res){
        wl0 = res;
    }));
    p.push(obj.invoke("NeMo.Intf.dsl0","getMIBs",{mibs:"dsl"}).done(function(res){
        dsl0 = res.dsl.dsl0;
    }));
    p.push(obj.invoke("NeMo.Intf.eth0","getMIBs",{mibs:"eth sfp"}).done(function(res){
        eth0["eth"] = res.eth.eth0;
        eth0["sfp"] = res.sfp.eth0;
        eth0.sfp["_temp"] = Number(eth0.sfp.SFP_Temperature / 256).toFixed(2);
        eth0.sfp["_txpower"] = Number(eth0.sfp.SFP_TxPower / 1000).toFixed(2);
        eth0.sfp["_rxpower"] = Number(eth0.sfp.SFP_RxPower / 1000).toFixed(2);
    }));
    p.push(obj.invoke("VoiceService.VoiceApplication","listTrunks",{}).done(function(res){
        trunks = res;
    }));

    $.when.apply($, p).done(function(){
        var phone_status = false;
        var phone_provisioned = false;
        if(trunks && trunks[0] && trunks[0].trunk_lines && trunks[0].trunk_lines[0] && 
            trunks[0].trunk_lines[0].status != undefined &&
            trunks[0].trunk_lines[0].enable != undefined){
            phone_status = (trunks[0].trunk_lines[0].status.toLowerCase() == "up");
            phone_provisioned = (trunks[0].trunk_lines[0].enable.toLowerCase() == "enabled");
        }
        service_status = {
            dsl: (dsl0.LinkStatus.toLowerCase() == "up"),
            fiber: (eth0.eth.CurrentBitRate != -1),
            internet: (hgw.Internet == 1),
            phone: (phone_provisioned && phone_status),
            phone_available: phone_provisioned,
            wireless: (wl0.Active == 1)
        }
        deferred.resolve();
    }).fail(function(){
        deferred.reject();  
    });

    return deferred.promise();
}

function displayBoxes(){
    var box;
    var content = $('.content').eq(0);

    box = addServiceBox("DSL");
    box.find('.itemlist')
       .append(addServiceItem("DSL Sync",function(){return dsl0.LinkStatus;}))
       .append(addServiceItem("Downstream",function(){return dsl0.DownstreamCurrRate + " Kbps";}))
       .append(addServiceItem("Upstream",function(){return dsl0.UpstreamCurrRate + " Kbps";}));
    content.append(box);

    box = addServiceBox("Fiber");
    box.find('.itemlist')
       .append(addServiceItem("Status",function(){return (eth0.eth.CurrentBitRate == -1 ? "Down" : "Up");}))
       .append(addServiceItem("Max Bitrate",function(){return eth0.eth.MaxBitRateSupported + " Mbps";}))
       .append(addServiceItem("Current Bitrate",function(){return (eth0.eth.CurrentBitRate == -1 ? "" : eth0.eth.CurrentBitRate + " Mbps");}))
       .append(addServiceItem("SFP Vendor Name",function(){return eth0.sfp.SFP_VendorName}))
       .append(addServiceItem("SFP Vendor S/N",function(){return eth0.sfp.SFP_VendorSN}))
       .append(addServiceItem("SFP Vendor P/N",function(){return eth0.sfp.SFP_VendorPN}))
       .append(addServiceItem("SFP Transmit Power",function(){return (eth0.sfp.SFP_TxPower == -2147483648 ? "" : eth0.sfp._txpower + " dBm")}))
       .append(addServiceItem("SFP Receive Power",function(){return (eth0.sfp.SFP_RxPower == -2147483648 ? "" : eth0.sfp._rxpower+ " dBm")}))
       .append(addServiceItem("SFP Temperature",function(){return (eth0.sfp.SFP_Temperature == -32768 ? "" : eth0.sfp._temp + " °C")}));
    content.append(box);

    box = addServiceBox("Internet");
    box.find('.itemlist')
       .append(addServiceItem("Status",function(){return (hgw.Internet==1?"Enabled":"Disabled");}))
       .append(addServiceItem("IP Address",function(){return hgw.ConnectionIPv4Address;}))
       .append(addServiceItem("Gateway",function(){return hgw.RemoteGateway;}))
       .append(addServiceItem("DNS",function(){return hgw.DNSServers;}));
    content.append(box);

    if(service_status.phone_available){
        box = addServiceBox("Phone");
        box.find('.itemlist')
           .append(addServiceItem("Line Registration",function(){return trunks[0].trunk_lines[0].status;}))
           .append(addServiceItem("Phone Number",function(){return trunks[0].trunk_lines[0].directoryNumber;}))
        content.append(box);
    }

    box = addServiceBox("Wireless");
    box.find('.itemlist')
       .append(addServiceItem("Status",function(){return (wl0.Active==1?"Enabled":"Disabled");}))
       .append(addServiceItem("SSID",function(){return wl0.SSID;}))
       .append(addServiceItem("WPA2 PSK",function(){return "<i>Printed on device</i>";}))
       .append(addServiceItem("WPS Mode",function(){return "<i>Push button</i>";}));
    content.append(box);

    $('.sel_lang [lang]').click(function(){
        lang = $(this).attr("lang");
        translator.loadJson(troubleshooting[lang]);
        translator.run();
    });

    showDefaultPage();
}

var cur_ts;
var showcustompage = false;
function showDefaultPage(){
    if(showcustompage) return;
    var service;
    var tsbox = $('.content').eq(1);
    if(!service_status.dsl && !service_status.fiber){
        service = "DSL|Fiber";
    }else if(!service_status.internet){
        service = "Internet";
    }else if(!service_status.wireless){
        service = "Wireless";
    }else if(!service_status.phone && service_status.phone_available){
        service = "Phone";
    }else{
        service = "";
    }
    if(cur_ts != service && service != undefined && service !== ""){
        cur_ts = service;
        var services = service.split('|');
        tsbox.html('');
        for(var i=0; i<services.length; i++){
            tsbox.append(displayTroubleShootBox(services[i]));
        }
    }else if(service === ""){
        cur_ts = "";
        tsbox.html("");
    }

}

var odd=0;
function addServiceBox(service){
    odd=0;
    var node = $('<div class="hbox"><div>'+
      '<div class="hbox icon"><img src="apps/images/icon-'+service.toLowerCase()+'.png" alt="'+service+'" /></div>'+
      '<div class="hbox boxtitle"><h1>'+service+'</h1></div>'+
      '<div class="hbox icon left"><img class="statusicon value" src=""/></div>'+
      '</div><div class="top"><table class="itemlist"></table></div></div><div class="vline"></div>');

    node.eq(0).data("service",service)
        .on("mouseover click",function(){
            if(cur_ts != service || !showcustompage){
                if(service_status[service.toLowerCase()]) return;
                cur_ts = service;
                showcustompage = true;
                var tsbox = $('.content').eq(1);
                tsbox.html(displayTroubleShootBox(service));
                $(".boxtitle").css("background-color","transparent");
                node.find(".boxtitle").css("background-color","#a3d47c");
            }
        }).on("mouseleave",function(){
            if(showcustompage){
                showcustompage = false;
                $(".boxtitle").css("background-color","transparent");
                showDefaultPage();
            }
        });
    node.find(".statusicon").bind("update",function(){
        var status = service_status[service.toLowerCase()];
        node.find('.statusicon').attr('src','apps/images/icon-'+(status?"ok":"fail")+'.png');
    });
    node.find('.value').trigger("update");
    return node;
}

function addServiceItem(name, getvalue){
    odd = (odd+1)%2;
    var node = $('<tr class="'+(odd?"odd":"")+'"><td>'+name+'</td><td class="value right">'+getvalue()+'</td></tr>');
    node.find(".value").bind("update",function(){
        $(this).html(getvalue());
    });
    return node;
}

function displayTroubleShootBox(service){
    var node = $('<div class="hbox relative helptext" ><div class="hbox green"><h1>Troubleshoot:</h1></div>'+
        '<div class="hbox left">'+
        '<div class="hbox icon"><img src="apps/images/icon-'+service.toLowerCase()+'.png" alt="'+service+'" /></div>'+
        '<div class="hbox"><h1>'+service+'</h1></div></div>'+
        '<div class="top"><div class="tsdiv hbox"></div></div>'+
        '<div class="hbox relative left bottom"><div class=tsimg></div></div>');

    if(service.toLowerCase() != "internet"){
        node.find(".tsimg").append('<img src="apps/images/ts_'+service.toLowerCase()+'.jpg"/>');
    }else{
         node.find(".tsimg").remove();
    }
    if(service.toLowerCase() == "fiber"){
        node.find(".tsimg").append('<img src="apps/images/ts_'+service.toLowerCase()+'2.jpg"/>');
    }
    
    for (var i=1; i <= countProperties(troubleshooting[lang][service.toLowerCase()]); i++){
        node.find(".tsdiv").append(addTroubleShootItem(i,service.toLowerCase()));
    } 
    return node;
}

function addTroubleShootItem(idx, service){
    var node = $(
        '<div class="bottom"><div class="hbox green">'+idx+'.</div>'+
        '<div class="leftdouble"></div></div>');
    node.find('.leftdouble').translate(service+'.'+idx);
    return node;
}

function countProperties(obj) {
    var count = 0;
    for(var prop in obj) {
        if(obj.hasOwnProperty(prop))
            ++count;
    }
    return count;
}

})();

