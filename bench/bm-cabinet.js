
var cabinet = require('..'),
    connect = require('connect');

var app = connect();

app.use(cabinet(__dirname + '/fixtures'));

app.listen(8181);
