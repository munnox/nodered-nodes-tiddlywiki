// Defining the node program for the tiddlywiki-search user which uses an optional config node for server and creds
// Derived from core node https://github.com/node-red/node-red/blob/master/packages/node_modules/%40node-red/nodes/core/network/21-httprequest.js
// Author Robert Munnoch

const { SSL_OP_MICROSOFT_BIG_SSLV3_BUFFER } = require("constants");

module.exports = function(RED) {
    "use strict";
    const got = require("got");

    // Augmented from https://stackoverflow.com/questions/19448436/how-to-create-date-in-yyyymmddhhmmss-format-using-javascript/19448657
    Date.prototype.YYYYMMDDHHMMSSMS = function () {

        /// Pad a number with zeros up to length
        function pad(number, length) {
            var str = '' + number;
            while (str.length < length) {
                str = '0' + str;
            }
            return str;
        }

        var yyyy = this.getFullYear().toString();
        var MM = pad(this.getMonth() + 1, 2);
        var dd = pad(this.getDate(), 2);
        var hh = pad(this.getHours(), 2);
        var mm = pad(this.getMinutes(), 2);
        var ss = pad(this.getSeconds(), 2);
        var ms = pad(this.getMilliseconds(), 3);

        return yyyy + MM + dd + hh + mm + ss + ms;
    };

    // Example get date
    function getDate() {
        var d = new Date();
        return d.YYYYMMDDHHMMSSMS();
    }

    function TiddlywikiSaveNode(config) {
        RED.nodes.createNode(this,config);
        var node = this;
        node.name = config.name || node.type;
        node.config = config;
        node.config.timeout = parseInt(node.config.timeout);

        // If the tiddlywiki server config node is defined then use it other wise fall back to local information
        if (config.tiddlywiki) {
            node.server = RED.nodes.getNode(config.tiddlywiki)
        }
        else {
            node.error(RED._("tiddlywiki.errors.no-server"),msg);
            nodeDone();
            return;
        }
        // // Further debug code while node is in development
        // node.warn("Node debug:");
        // node.warn(JSON.parse(JSON.stringify(node)));

        node.status({});

        const options = {
            prefixUrl: node.server.url,
            timeout: node.config.timeout,
            method: 'PUT',
            maxRedirects: 3,
            forever: false,
            headers: {
                "content-type": "application/json",
                "X-Requested-With": "TiddlyWiki",
                "Authorization": "Basic " + new Buffer.from(node.server.credentials.username + ':' + node.server.credentials.password).toString('base64')
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

        var promise =null;
    
        node.search = function(msg, nodeSend, nodeDone) {
            node.trace("Running Tiddlywiki Save")
            var preRequestTimestamp = process.hrtime();

            node.status({fill:"blue",shape:"dot",text:"tiddlywiki.status.requesting"});

            if (msg.tidder && msg.tidder.context && msg.tiddler.context.wiki_url) {
                options.prefixUrl = msg.tiddler.context.wiki_url;
            }

            if (options.prefixUrl != node.server.url) {
                node.error(`Wrong server url found in tiddler than in credenials ${options.prefixUrl} ${node.server.url}`);
                nodeDone()
                return
            }

            // If the input msg has a filter defined allow that to override node filter
            var title = node.config.title; 
            if (msg.tiddler != undefined) {
                if (msg.tiddler.title != undefined) {
                    title = msg.tiddler.title;
                }
            }
            else if (msg.title != undefined) {
                title = msg.title;
            }

            // the filter does not seem to nee encoding
            title = encodeURIComponent(title);

            if (msg.tiddler.created == undefined) {
                msg.tiddler.created = getDate();
            }
            if (msg.tiddler.modified == undefined) {
                msg.tiddler.modified = getDate();
            }
            options.body = JSON.stringify(msg.tiddler);
            // var filter = msg.filter;
            var path = `recipes/default/tiddlers/${title}`;

            var result = null
            promise = got(path, options).then(res => {
                // node.warn("Success")

                // Calculate request time
                var diff = process.hrtime(preRequestTimestamp);
                var ms = diff[0] * 1e3 + diff[1] * 1e-6;
                var metricRequestDurationMillis = ms.toFixed(3);
                if (node.metric()) {
                    node.metric("duration.millis", msg, metricRequestDurationMillis);
                    if (res.client && res.client.bytesRead) {
                        node.metric("size.bytes", msg, res.client.bytesRead);
                    }
                }

                msg.responseTime = ms;
                nodeContext.set("lastrequest", ms);

                if (res.statusCode == 204) {
                    var preProcessTimestamp = process.hrtime();
                    msg.status = "success";
                    msg.payload = res.body;
                    // try { msg.tiddler = JSON.parse(res.body); } // obj
                    // catch(e) { node.error(RED._("tiddlywiki.errors.json-error")); }
                    // Add context to the tiddlers recovered
                    // delete msg.payload;
                    // delete msg.url;
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
                    msg.options = options;
                    msg.statusCode = res.statusCode;
                    // msg.headers = res.headers;
                    msg.responseUrl = res.url;
                    msg.payload = res.body;

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
            }, (res) => {
                node.error("errored:" + res);
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
            // setTimeout(() => {
            //     promise.cancel("Timeout");
            // }, 1000);
            // nodeContext.set("promise", promise);
            // node.error(`promise: ${promise}`);
            
        }

        node.on('input', function(msg, nodeSend, nodeDone) {
            node.search(msg, nodeSend, nodeDone);
        });

    }
    RED.nodes.registerType("tiddlywiki-save", TiddlywikiSaveNode);
}
