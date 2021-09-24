// Defining the node server config program for the tiddlywiki-config to define a server
// Derived from core node https://github.com/node-red/node-red/blob/master/packages/node_modules/%40node-red/nodes/core/network/05-tls.js
// Author Robert Munnoch

module.exports = function(RED) {
    "use strict";
    const got = require("got");

    function TiddlywikiConfigNode(config) {
        RED.nodes.createNode(this,config);
        this.name = config.name;
        this.url = config.url || "http://localhost:5000";
        this.filter = config.filter || "[all[tiddlers]!is[system]sort[title]]";

        // Further debug information
        // this.username = this.credentials.username || "user";
        // var node = this;
        // node.error(`Making config node config:\n${JSON.stringify(config, null, 2)}`);
        // node.error(`Final config Node:\n${JSON.stringify(this, null, 2)}`);

    }
    RED.nodes.registerType("tiddlywiki-config", TiddlywikiConfigNode, {
        credentials: {
            username: {type:"text"},
            password: {type:"password"}
        }
    });
}
