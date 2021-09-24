# NodeRED Tiddlywiki Node

To build a custom tiddly wiki node.

```bash
# Build the package
npm build
# create a tgz which can then be upload to the nodred server
npm pack

# Alias
# Create a nodered server to test with
alias server="docker run -d -p 1880:1880 --name mynodered -v `pwd`/:/tw/ nodered/node-red"
alias install="docker exec mynodered npm install /tw/"
alias restart="docker restart mynodered"
# docker run -d -p 1880:1880 --name mynodered nodered/node-red

alias remove="docker rm -f mynodered"
# Upload module
alias pushmod="curl -X POST --compressed -F tarball=@'nodered_tiddlywiki-0.1.0.tgz' 'http://localhost:1880/nodes'"

# Delete module
alias rmmod="curl 'http://localhost:1880/nodes/nodered_tiddlywiki' -X DELETE"
```

