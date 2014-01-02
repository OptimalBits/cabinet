var cabinet = require('..'),
    connect = require('connect'),
    request = require('supertest'),
    expect = require('expect.js');

var app = connect();

app.use(cabinet(__dirname + '/fixtures', {
  typescript: {
    module: 'amd',
    concatenate: false
  },
  coffee: true,
  less:{
    // Specify search paths for @import directives
    paths: ['.',__dirname + '/static/stylesheets']
  },
  stylus:{
    paths:[]
  }
}));

describe('File Cabinet with filters', function(){
  it('should not detect typescript incorrectly', function(done){
    request(app)
    .get('/filtermatching/bits/im_not_ts.js')
      .expect(200)
      .end(done);
  });
  
  it('should not detect coffeescript incorrectly', function(done){
    request(app)
    .get('/filtermatching/xcoffee/im_not_coffee.js')
      .expect(200)
      .end(done);
  });
  
  it('should not detect less incorrectly', function(done){
    request(app)
    .get('/filtermatching/unless/im_not_less.css')
      .expect(200)
      .end(done);
  });

  it('should not detect stylus incorrectly', function(done){
    request(app)
    .get('/filtermatching/badstyle/im_not_stylus.css')
      .expect(200)
      .end(done);
  });
});
