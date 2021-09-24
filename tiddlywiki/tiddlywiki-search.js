// Defining the node program for the tiddlywiki-search user which uses an optional config node for server and creds
// Derived from core node https://github.com/node-red/node-red/blob/master/packages/node_modules/%40node-red/nodes/core/network/21-httprequest.js
// Author Robert Munnoch

module.exports = function(RED) {
    "use strict";
    const got = require("got");

    function TiddlywikiSearchNode(config) {
        RED.nodes.createNode(this,config);
        // this.server = {
        //     host: "localhost",
        //     port: 1880
        // }

        // If the tiddlywiki server config node is defined then use it other wise fall back to local information
        if (config.tiddlywiki) {
            var server = RED.nodes.getNode(config.tiddlywiki)
            server.url = config.url || server.url;
            // use the filter from the node faling back to the server default.
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
        // node.error(`Making node, Config:\n${JSON.stringify(config, null, 2)}`);
        // node.error(`Node tiddlywiki server:\n${JSON.stringify(server, null, 2)}`);
        // node.error(JSON.parse(JSON.stringify(server)));

        const options = {
            // hostname: node.server.host,
            // port: node.server.port,
            // path: '/test',
            timeout: 60000,
            // protocol: "https:",
            method: 'GET',
            maxRedirects: 21,
            headers: {
                "content-type": "application/json",
                "X-Requested-With": "TiddlyWiki",
                "Authorization": "Basic " + new Buffer(server.credentials.username + ':' + server.credentials.password).toString('base64')
            } 
        }
        var nodeContext = this.context();
        nodeContext.set("test", "value");
    

        node.search = function(msg, nodeSend, nodeDone) {
            node.trace("Running Tiddlywiki Search")
            var preRequestTimestamp = process.hrtime();
            node.status({fill:"blue",shape:"dot",text:"httpin.status.requesting"});


            if (msg.filter == undefined) {
                msg.filter = server.filter;
            }

            // var filter = encodeURIComponent(msg.filter);
            var filter = msg.filter;
            var url = `${server.url}/recipes/default/tiddlers.json?filter=${filter}`;

            var result = null
            got(url, options).then(res => {
                node.warn("Success")
                msg.options = options;
                msg.statusCode = res.statusCode;
                // msg.headers = res.headers;
                msg.responseUrl = res.url;
                msg.payload = res.body;
                nodeSend([msg, null]);
                if (msg.statusCode == 200) {
                    try { msg.tiddlers = JSON.parse(msg.payload); } // obj
                    catch(e) { node.warn(RED._("httpin.errors.json-error")); }
                    msg.tiddlers.map((tid) => {
                        tid.context = {
                            wiki_url: server.url,
                            filter: filter
                        }
                        return tid;
                    });
                    delete msg.payload;
                    delete msg.url;
                    delete msg.statusCode;
                    // delete msg.topic;
                    // delete msg.headers;
                    delete msg.responseUrl;
                    // delete msg.redirectList;
                    // delete msg.retry;
                    var status = { fill: "green", shape: "dot", text: "Success" };
                    node.status(status);
                    result = [msg, null];
                }
                else {
                    var status = { fill: "red", shape: "circle", text: "Failed" };
                    node.status(status);
                    node.error(`Failed to Get Tiddler: ${msg.responseUrl}, payload: ${msg.payload}`);
                    result = [null, msg];
                }
                //msg.redirectList = redirectList;
                // Convert the payload to the required return type
                // if (node.ret !== "bin") {
                //     msg.payload = msg.payload.toString('utf8'); // txt

                //     if (node.ret === "obj") {
                //         try { msg.payload = JSON.parse(msg.payload); } // obj
                //         catch(e) { node.warn(RED._("httpin.errors.json-error")); }
                //     }
                // }
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
                //node.status({fill: "green", shape: "dot", text: "Success"});
                nodeSend(result);
                nodeDone();
            }).catch(err => {
                if(err.code === 'ETIMEDOUT' || err.code === 'ESOCKETTIMEDOUT') {
                    node.error(RED._("common.notification.errors.no-response"), msg);
                    node.status({fill:"red", shape:"ring", text:"common.notification.errors.no-response"});
                }else{
                    node.error(err,msg);
                    node.status({fill:"red", shape:"ring", text:err.code});
                }
                msg.payload = err.toString() + " : " + url;
                msg.statusCode = err.code || (err.response?err.response.statusCode:undefined);
                nodeSend(msg);
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
