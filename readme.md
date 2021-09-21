# NodeRED Tiddlywiki Node

To build a custom tiddly wiki node.

```bash
# Build the package
npm build
# create a tgz which can then be upload to the nodred server
npm pack

# Create a nodred server to test with
docker run -d -p 1880:1880 --name mynodered -v `pwd`/:/tw/ nodered/node-red
```

