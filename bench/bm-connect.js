var connect = require('connect');

var app = connect();

app.use(connect.static(__dirname + '/fixtures'));

app.listen(8181);
