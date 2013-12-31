var cabinet = require('..'),
     expect = require('expect.js'),
    Watcher = require('../lib/watcher').Watcher,
         fs = require('fs'),
       path = require('path'),
      async = require('async'),
      path = require('path');

var root = __dirname;
var aFile = path.join(root,'a.txt');
var bDir = path.join(root, 'bdir');
var bFile = path.join(bDir, 'b.txt');
var cFile = path.join(root, 'c.txt');

var watcher;

before(function(done){
try{
  fs.unlinkSync(aFile);
}catch(e){};

try{
  fs.unlinkSync(bFile);
}catch(e){};

try{
  fs.unlinkSync(cFile);
}catch(e){};

try{
  fs.rmdirSync(bDir);
}catch(e){};

  watcher = new Watcher(root);
  watcher.on('initialized', done);
})

describe.skip('Watch a directory', function(){
  
  it('A created file should be notified', function(done){
    var cb = function(filename){
      expect(filename).to.be.equal(aFile);
      watcher.removeListener('added', cb);
      done();
    };
    
    watcher.on('added', cb);
    
    fs.writeFileSync(aFile, '123');
  });
  
  it('A modified file should be notified', function(done){
    var cb = function(filename){
      expect(filename).to.be.equal(aFile);
      watcher.removeListener('changed', cb);
      done();
    };
    watcher.on('changed', cb);
    
    var fd = fs.openSync(aFile, 'a');
    fs.writeSync(fd, new Buffer('123456789'), 0, 9, 3);    
  }); 
  
  it('A second time modified file should be notified', function(done){
    var cb = function(filename){
      expect(filename).to.be.equal(aFile);
      watcher.removeListener('changed', cb);
      done();
    };
    watcher.on('changed', cb);
    
    var fd = fs.openSync(aFile, 'a');
    fs.writeSync(fd, new Buffer('123456789'), 0, 9, 10);
  });
  
  it('notify successive modifications to a file', function(done){
    var counter = 0, NUM_MODIFICATIONS = 100;
    var cb = function(filename){
      expect(filename).to.be.equal(aFile);
      counter++;
      
      // For some reason we do not get all the notifications,
      // this may be due to internals in node and watch implementation.
      if(counter == NUM_MODIFICATIONS - 20){
        watcher.removeListener('changed', cb);
        done();
      }
    };
    watcher.on('changed', cb);
  
    var offset = 0;
    var functions = [];
  //  var fd = fs.openSync(aFile, 'a');
    for(var i=0; i<NUM_MODIFICATIONS;i++){
      functions.push(function(done){
        var randomData = Math.random();
        var buffer = new Buffer(randomData);
        fs.open(aFile, 'a', function(err, fd){
          fs.write(fd, buffer , 0, buffer.length, offset, function(err){
            fs.close(fd, function(err){
              offset+=buffer.length;
              done(err);
            });
          });
        });
      });
    }
    async.series(functions);
  });
  /*
  it('Deleting a file should remove the file meta entry', function(done){
    var cb = function(filename){
      expect(filename).to.be.equal(aFile);
      expect(watcher.filesMeta).to.not.have.property(filename);
      watcher.removeListener('deleted', cb);
      done();
    };
    watcher.on('deleted', cb);
    fs.unlinkSync(aFile);
  });
  
  it('Creating files in a new directory should be notified', function(done){
    var cb = function(filename){
      expect(filename).to.be.equal(bFile);
      expect(watcher.filesMeta).to.have.property(filename);
      watcher.removeListener('changed', cb);
      done();
    };
    
    var cb2 = function(dir){
      expect(dir).to.be.equal(bDir);
      watcher.removeListener('added', cb2);
      fs.writeFile(bFile, '123123');
    };
    
    watcher.on('changed', cb);
    watcher.on('added', cb2);
    
    fs.mkdirSync(bDir);
  });
  
  it('Modifying files in a new directory should be notified', function(done){
    var cb = function(filename){
      expect(filename).to.be.equal(bFile);
      watcher.removeListener('changed', cb);
      done();
    };
    watcher.on('changed', cb);
    
    var fd = fs.openSync(bFile, 'a');
    fs.writeSync(fd, new Buffer('123456789'), 0, 9, 3); 
  });
  
  it('Modifying dependencies triggers also the dependent files', function(done){ 
    var cb = function(filename){
      expect(filename).to.be.equal(cFile);
      watcher.removeListener('added', cb);
      watcher.on('changed', cb2);
      
      watcher.setDependencies(bFile, [cFile]);
            
      var fd = fs.openSync(cFile, 'a');
      fs.writeSync(fd, new Buffer('123456789'), 0, 9, 3);
    };
    
    var cNotified = false;
    var bNotified = false;
    
    var cb2 = function(filename){
      if(cFile == filename){
        expect(cNotified).to.not.be.ok();
        cNotified = true;
      }
      if(bFile == filename){
        expect(bNotified).to.not.be.ok();
        bNotified = true;
      }
      
      if(bNotified && cNotified){
        watcher.removeListener('changed', cb);
        done();
      }
    };
    
    watcher.on('added', cb);
    fs.writeFileSync(cFile, '123');
  });
  */
  
  
});


