
var cabinet = require('..'),
    send = require('send'),
    http = require('http'),
    connect = require('connect'),
    request = require('supertest'),
    expect = require('expect.js');

var app = connect();

app.use(cabinet(__dirname + '/fixtures', {
  gzip:true,
  cache:{
    maxSize: 1024, 
    maxObjects:256
  },
  coffee:true,
  stylus:{
    paths:[]
  }
}));

describe('File Cabinet With Cache and Gzip Enabled', function(){

  it('should serve unzipped files', function(done){
    request(app)
    .get('/todo.txt')
    .expect('Content-Type', 'text/plain; charset=UTF-8')
    .expect('- groceries', done);
  });
  
  // This test case does not work with supertest 0.0.1, unfortunatelly, 
  // never versions of supertest breaks other unit tests...
  /*
  it('should serve a coffe script as a zipped file', function(done){
    request(app)
      .get('/arrays.coffee')
      .set('accept-encoding', 'gzip')
      .expect('Content-Encoding', 'gzip')
      .expect('Content-Length', '721', done)
  });
  */  
});
