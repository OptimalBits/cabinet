
var cabinet = require('..'),
    send = require('send'),
    http = require('http'),
    connect = require('connect'),
    request = require('supertest'),
    expect = require('expect.js');

var app = connect();

app.use(cabinet(__dirname + '/fixtures', {
  cache:{
    maxSize: 1024, 
    maxObjects:256
  },
  coffee:true
},{
  '/foobar.appcache': cabinet.virtuals.manifest(['/cached1.txt', '/cached2.txt'])
  }
));

app.use(function(req, res){
  res.statusCode = 404;
  res.end('Not Found');
});

describe('File Cabinet With Cache Virtuals', function(){
  it('should serve application manifest', function(done){
    request(app)
    .get('/foobar.appcache')
    .end(function(err, res){
      if (err) return done(err);
      expect(res.text.length).to.be.above(50);
      expect(res.headers).to.have.property('content-type');
      expect(res.headers['content-type']).to.be.equal('text/cache-manifest; charset=UTF-8');
      done();
    });
  });
});
