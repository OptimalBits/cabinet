
var cabinet = require('..'),
    connect = require('connect');

var app = connect();

app.use(cabinet(__dirname + '/fixtures', {
  cache:{
    maxSize: 16384, //16Kb 
    maxObjects:256
  },
  coffee:true,
  minjs:true,
  gzip:true
}));

app.listen(8181);
