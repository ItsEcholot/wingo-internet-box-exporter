import fetch from 'node-fetch';
import {createServer} from 'http';
import url from 'url';
import {Registry, Gauge} from 'prom-client';

const boxIp = process.env.BOX_IP ? process.env.BOX_IP : '192.168.0.254';
const boxUrl = `http://${boxIp}`;

const registry = new Registry();
registry.setDefaultLabels({
    instance: boxIp,
})

const dslUpstreamRate = new Gauge({
    name: 'wingo_dsl_upstream_rate_kbps',
    help: 'DSL Upstream Rate in Kbps',
});
const dslDownstreamRate = new Gauge({
    name: 'wingo_dsl_downstream_rate_kbps',
    help: 'DSL Downstream Rate in Kbps',
});
const dslLineStatus = new Gauge({
    name: 'wingo_dsl_line_status',
    help: 'Boolean indicating DSL connectivity',
});
const dslLastChange = new Gauge({
    name: 'wingo_dsl_last_change',
    help: 'Seconds till last line status change',
});
const dslUpstreamNoiseMargin = new Gauge({
    name: 'wingo_dsl_upstream_noise_margin',
    help: 'DSL Upstream noise margin',
});
const dslDownstreamNoiseMargin = new Gauge({
    name: 'wingo_dsl_downstream_noise_margin',
    help: 'DSL Downstream noise margin',
});
const dslUpstreamAttenuation = new Gauge({
    name: 'wingo_dsl_upstream_attenuation',
    help: 'DSL Upstream attenuation',
});
const dslDownstreamAttenuation = new Gauge({
    name: 'wingo_dsl_downstream_attenuation',
    help: 'DSL Downstream attenuation',
});

registry.registerMetric(dslUpstreamRate);
registry.registerMetric(dslDownstreamRate);
registry.registerMetric(dslLineStatus);
registry.registerMetric(dslLastChange);
registry.registerMetric(dslUpstreamNoiseMargin);
registry.registerMetric(dslDownstreamNoiseMargin);
registry.registerMetric(dslUpstreamAttenuation);
registry.registerMetric(dslDownstreamAttenuation);

const makeDataRequest = (service, method, args = {}) => {
    return fetch(`${boxUrl}/ws`, {
        method: 'POST',
        headers: {
            "Content-Type": "application/x-sah-ws-4-call+json",
            "Origin": boxUrl,
            "Referer": boxUrl,
            "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({
            "service": service, "method": method, "parameters": args
        })
    });
}

const server = createServer(async (req, res) => {
    // Retrieve route from request object
    const route = url.parse(req.url).pathname

    if (route === '/metrics') {
        const dslData = (await (await makeDataRequest('NeMo.Intf.dsl0', 'get')).json()).status;
        dslUpstreamRate.set(dslData['Line_UpstreamCurrRate']);
        dslDownstreamRate.set(dslData['Line_DownstreamCurrRate']);
        dslLineStatus.set(dslData['LineStatus'] === 'Up' && dslData['LinkStatus'] === 'Up' ? 1 : 0);
        dslLastChange.set(dslData['Line_LastChange']);
        dslUpstreamNoiseMargin.set(dslData['Line_UpstreamNoiseMargin'] / 10);
        dslDownstreamNoiseMargin.set(dslData['Line_DownstreamNoiseMargin'] / 10);
        dslUpstreamAttenuation.set(dslData['Line_UpstreamAttenuation'] / 10);
        dslDownstreamAttenuation.set(dslData['Line_DownstreamAttenuation'] / 10);

        // Return all metrics the Prometheus exposition format
        res.setHeader('Content-Type', registry.contentType)
        res.end(await registry.metrics())
    }
})

server.listen(80);