
/**
 * Module dependencies.
 */

var assert = require('assert')
  , knox = require('../lib/knox')
  , fs = require('fs');

try {
  var auth = JSON.parse(fs.readFileSync('auth', 'ascii'));
  var client = knox.createClient(auth[0]);
  var other = knox.createClient(auth[1]);
} catch (err) {
  console.error('`make test` requires ./auth to contain a JSON string with');
  console.error('`key, secret, and bucket in order to run tests.');
  process.exit(1);
}

var jsonFixture = __dirname + '/fixtures/user.json';

module.exports = {
  'test .version': function(){
    assert.ok(/^\d+\.\d+\.\d+$/.test(knox.version));
  },
  
  'test .createClient() invalid': function(){
    var err;
    try {
      knox.createClient({});
    } catch (e) {
      err = e;
    }
    assert.equal('aws "key" required', err.message);
    
    var err;
    try {
      knox.createClient({ key: 'foo' });
    } catch (e) {
      err = e;
    }
    assert.equal('aws "secret" required', err.message);
  },
  
  'test .createClient() valid': function(){
    var client = knox.createClient({
        key: 'foobar'
      , secret: 'baz'
      , bucket: 'misc'
    });
    
    assert.equal('foobar', client.key);
    assert.equal('baz', client.secret);
    assert.equal('misc', client.bucket);
    assert.equal('s3.amazonaws.com', client.endpoint);
  },
  
  'test .createClient() custom endpoint': function(){
    var client = knox.createClient({
        key: 'foobar'
      , secret: 'baz'
      , bucket: 'misc'
      , endpoint: 's3-eu-west-1.amazonaws.com'
    });

    assert.equal('s3-eu-west-1.amazonaws.com', client.endpoint);
  },

  'test .putFile()': function(done){
    var n = 0;
    client.putFile(jsonFixture, '/test/user2.json', function(err, res){
      assert.ok(!err, 'putFile() got an error!');
      assert.equal(200, res.statusCode);
      client.get('/test/user2.json').on('response', function(res){
        assert.equal('application/json', res.headers['content-type']);
        done();
      }).end();
    });
  },
  
  'test .put()': function(done){
    var n = 0;
    fs.stat(jsonFixture, function(err, stat){
      if (err) throw err;
      fs.readFile(jsonFixture, function(err, buf){
        if (err) throw err;
        var req = client.put('/test/user.json', {
            'Content-Length': stat.size
          , 'Content-Type': 'application/json'
          , 'x-amz-acl': 'private'
        });
        req.on('response', function(res){
          assert.equal(200, res.statusCode);
          assert.equal(
              'https://'+client.endpoint+'/'+client.bucket+'/test/user.json'
            , client.url('/test/user.json'));
          assert.equal(
              'https://'+client.endpoint+'/'+client.bucket+'/test/user.json'
            , req.url);
          done();
        });
        req.end(buf);
      })
    });
  },
  
  'test .putStream()': function(done){
    var stream = fs.createReadStream(jsonFixture);
    client.putStream(stream, 'test/user.json', function(err, res){
      assert.ok(!err);
      if (100 !== res.statusCode) assert.equal(200, res.statusCode);
      done();
    });
  },

  'test .createWriteStream()': function(done){
    var stream = fs.createReadStream(jsonFixture);
    var multipart = client.createWriteStream('/test/user.json', {
      'Content-Type': 'application/json'
    });
    
    multipart.on('response', function(res){
      assert.equal(200, res.statusCode);
      done();
    }).on('error', function(e){
      done(e);
    });

    require('util').pump(stream, multipart);
  },

  'test .createWriteStream() >5MB': function(done){
    this.timeout(5 * 60 * 1000); // 5 minutes to upload 5MB
    var source = require('url').parse('http://upload.wikimedia.org/wikipedia/commons/2/21/Earthlights_dmsp.jpg');

    require('http').get(source, function (res){
      assert.equal(200, res.statusCode);

      var length = Number(res.headers['content-length']);
      assert.ok(length > 5*1024*1024);

      var multipart = client.createWriteStream('/test/image.jpg', {
        'Content-Type': 'image/jpeg'
      });

      require('util').pump(res, multipart);
      multipart.on('response', function() {
        assert.equal(200, res.statusCode);
        done()
      }).on('error', function(e){
        done(e);
      });
    });
  },
  
  'test .getFile()': function(done){
    client.getFile('/test/user.json', function(err, res){
      assert.ok(!err);
      assert.equal(200, res.statusCode);
      assert.equal('application/json', res.headers['content-type'])
      assert.equal(13, res.headers['content-length'])
      done();
    });
  },
  
  'test .get()': function(done){
    client.get('/test/user.json').on('response', function(res){
      assert.equal(200, res.statusCode);
      assert.equal('application/json', res.headers['content-type'])
      assert.equal(13, res.headers['content-length'])
      done();
    }).end();
  },
  
  'test .head()': function(done){
    client.head('/test/user.json').on('response', function(res){
      assert.equal(200, res.statusCode);
      assert.equal('application/json', res.headers['content-type'])
      assert.equal(13, res.headers['content-length'])
      done();
    }).end();
  },
  
  'test .headFile()': function(done){
    client.headFile('/test/user.json', function(err, res){
      assert.ok(!err);
      assert.equal(200, res.statusCode);
      assert.equal('application/json', res.headers['content-type'])
      assert.equal(13, res.headers['content-length'])
      done();
    });
  },
  
  'test .copy()': function(done){
    client.copy('/test/user2.json','/test/user.json').on('response',function(res){
      assert.equal(200, res.statusCode);
      done();
    }).end();
  },
  
  'test .copy() from same client': function(done){
    client.copy('/test/user3.json',{filename:'/test/user.json',client:client}).on('response',function(res){
      assert.equal(200, res.statusCode);
      done();
    }).end();
  },
  
  'test .copy() from other client': function(done){
    other.copy('/test/user.json',{filename:'/test/user.json',client:client}).on('response',function(res){
      assert.equal(200, res.statusCode);
      done();
    }).end();
  },
  
  'test .del()': function(done){
    client.del('/test/user.json').on('response', function(res){
      assert.equal(204, res.statusCode);
      done();
    }).end();
  },
  
  'test .deleteFile()': function(done){
    client.deleteFile('/test/user2.json', function(err, res){
      assert.ok(!err);
      assert.equal(204, res.statusCode);
      done();
    });
  },
  
  'test .get() 404': function(done){
    client.get('/test/does-not-exist.json').on('response', function(res){
      assert.equal(404, res.statusCode);
      done();
    }).end();
  },
  
  'test .head() 404': function(done){
    client.head('/test/does-not-exist.json').on('response', function(res){
      assert.equal(404, res.statusCode);
      done();
    }).end();
  }
};
