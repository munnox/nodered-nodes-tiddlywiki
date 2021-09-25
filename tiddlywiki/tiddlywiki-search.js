// Defining the node program for the tiddlywiki-search user which uses an optional config node for server and creds
// Derived from core node https://github.com/node-red/node-red/blob/master/packages/node_modules/%40node-red/nodes/core/network/21-httprequest.js
// Author Robert Munnoch

module.exports = function(RED) {
    "use strict";
    const got = require("got");

    function TiddlywikiSearchNode(config) {
        RED.nodes.createNode(this,config);

        // If the tiddlywiki server config node is defined then use it other wise fall back to local information
        if (config.tiddlywiki) {
            var server = RED.nodes.getNode(config.tiddlywiki)
            server.url = config.url || server.url;
            // Use the filter from the node faling back to the server default.
            server.filter = config.filter || server.filter;
        }
        else {
            var server = {
                url: config.url,
                filter: config.filter,
                credentials: {
                    username: this.credentials.username,
                    password: this.credentials.password,
                }
            }
            // node.error(RED._("tiddlywiki.errors.no-server"),msg);
            // nodeDone();
            // return;
        }
        var node = this;
        node.config = config;
        node.config.timeout = parseInt(node.config.timeout);
        node.server = server;
        // // Further debug code while node is in development
        // node.error("Node debug:");
        // node.error(JSON.parse(JSON.stringify(node)));

        const options = {
            prefixUrl: node.server.url,
            timeout: node.config.timeout,
            method: 'GET',
            maxRedirects: 3,
            forever: false,
            headers: {
                "content-type": "application/json",
                "X-Requested-With": "TiddlyWiki",
                "Authorization": "Basic " + new Buffer(node.server.credentials.username + ':' + node.server.credentials.password).toString('base64')
            } 
        }
        var nodeContext = this.context();
        nodeContext.set("successes", 0);
        nodeContext.set("failures", 0);
        nodeContext.set("rate", 0);

        function incsuccesses() {
            nodeContext.set("successes", parseInt(nodeContext.get("successes"))+1);
            nodeContext.set("rate", parseInt(nodeContext.get("successes"))/(parseFloat(nodeContext.get("successes")) + parseInt(nodeContext.get("failures"))));
        }
        function incfailures() {
            nodeContext.set("failures", parseInt(nodeContext.get("failures"))+1);
            nodeContext.set("rate", parseInt(nodeContext.get("successes"))/(parseFloat(nodeContext.get("successes")) + parseInt(nodeContext.get("failures"))));
        }
    
        node.search = function(msg, nodeSend, nodeDone) {
            node.trace("Running Tiddlywiki Search")
            var preRequestTimestamp = process.hrtime();

            node.status({fill:"blue",shape:"dot",text:"tiddlywiki.status.requesting"});

            // If the input msg has a filter defined allow that to override node filter
            if (msg.filter == undefined) {
                msg.filter = node.server.filter;
            }

            // the filter does not seem to nee encoding
            var filter = encodeURIComponent(msg.filter);
            // var filter = msg.filter;
            var url = `recipes/default/tiddlers.json?filter=${filter}`;

            var result = null
            got(url, options).then(res => {
                // node.warn("Success")
                msg.options = options;
                msg.statusCode = res.statusCode;
                // msg.headers = res.headers;
                msg.responseUrl = res.url;
                msg.payload = res.body;

                if (node.metric()) {
                    // Calculate request time
                    var diff = process.hrtime(preRequestTimestamp);
                    var ms = diff[0] * 1e3 + diff[1] * 1e-6;
                    var metricRequestDurationMillis = ms.toFixed(3);
                    node.metric("duration.millis", msg, metricRequestDurationMillis);
                    if (res.client && res.client.bytesRead) {
                        node.metric("size.bytes", msg, res.client.bytesRead);
                    }
                }

                msg.requestTime = ms;
                nodeContext.set("lastrequest", ms);

                if (msg.statusCode == 200) {
                    var preProcessTimestamp = process.hrtime();
                    msg.status = "success";
                    try { msg.tiddlers = JSON.parse(msg.payload); } // obj
                    catch(e) { node.error(RED._("tiddlywiki.errors.json-error")); }
                    // Add context to the tiddlers recovered
                    msg.tiddlers.map((tid) => {
                        tid.context = {
                            wiki_url: server.url,
                            filter: filter
                        }
                        return tid;
                    });
                    delete msg.payload;
                    delete msg.url;
                    // delete msg.statusCode;
                    // delete msg.topic;
                    // delete msg.headers;
                    // delete msg.responseUrl;
                    // delete msg.redirectList;
                    // delete msg.retry;
                    var pdiff = process.hrtime(preProcessTimestamp);
                    var pms = pdiff[0] * 1e3 + pdiff[1] * 1e-6;
                    var metricProcessDurationMillis = pms.toFixed(3);
                    incsuccesses();

                    var status = { fill: "green", shape: "dot", text: `Success (${metricProcessDurationMillis})` };
                    node.status(status);
                    result = [msg, null];
                }
                else {
                    incfailures();
                    msg.status = "failed";
                    var status = { fill: "red", shape: "circle", text: "Failure" };
                    node.status(status);
                    node.error(RED._("tiddlywiki.errors.server_error"));
                    node.error(`Failed to Get Tiddler: ${msg.responseUrl}, payload: ${msg.payload}`);
                    result = [null, msg];
                }

                
                status.text += " in: " + metricRequestDurationMillis;
                node.status(status);
                nodeSend(result);
                nodeDone();
            }).catch(err => {
                incfailures();
                if (node.metric()) {
                    // Calculate request time
                    var diff = process.hrtime(preRequestTimestamp);
                    var ms = diff[0] * 1e3 + diff[1] * 1e-6;
                    var metricRequestDurationMillis = ms.toFixed(3);
                    node.metric("duration.millis", msg, metricRequestDurationMillis);
                    if (res.client && res.client.bytesRead) {
                        node.metric("size.bytes", msg, res.client.bytesRead);
                    }
                }

                msg.requestTime = ms;
                nodeContext.set("lastrequest", ms);

                if(err.code === 'ETIMEDOUT' || err.code === 'ESOCKETTIMEDOUT') {
                    node.error(RED._("common.notification.errors.no-response"), msg);
                    node.status({fill:"red", shape:"ring", text:"common.notification.errors.no-response"});
                }else{
                    node.error(err,msg);
                    node.status({fill:"red", shape:"ring", text:err.code});
                }
                msg.options = options;
                msg.payload = err.toString() + " : " + url;
                msg.statusCode = err.code || (err.response?err.response.statusCode:undefined);
                nodeSend([null,msg]);
                nodeDone();
            });
            
        }

        node.on('input', function(msg, nodeSend, nodeDone) {
            node.search(msg, nodeSend, nodeDone);
        });

    }
    RED.nodes.registerType("tiddlywiki-search", TiddlywikiSearchNode, {
        credentials: {
            username: {type:"text"},
            password: {type:"password"}
        }
    });
}
