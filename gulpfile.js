var gulp = require('gulp');
var filter = require('gulp-filter');
var kclean = require('gulp-kclean');
var modulex = require('gulp-modulex');
var path = require('path');
var rename = require('gulp-rename');
var packageInfo = require('./package.json');
var src = path.resolve(process.cwd(), 'lib');
var build = path.resolve(process.cwd(), 'build');
var uglify = require('gulp-uglify');
var replace = require('gulp-replace');
var wrapper = require('gulp-wrapper');
var tap = require('gulp-tap');

var date = new Date();
var header = ['/*',
  'Copyright ' + date.getFullYear() + ', ' + packageInfo.name + '@' + packageInfo.version,
  packageInfo.license + ' Licensed',
  'build time: ' + (date.toGMTString()),
  '*/', ''].join('\n');

gulp.task('xtemplate', function () {
  var CombinedStream = require('combined-stream');
  var combinedStream = CombinedStream.create();
  var packages = {};
  var fullName = 'xtemplate/' + packageInfo.version;
  packages[fullName] = {
    base: path.resolve(src)
  };

  ['index', 'runtime'].forEach(function (mod) {
    var js = mod + '.js';
    var debugJs = mod + '-debug.js';
    var excludeModules;
    if (mod === 'index') {
      excludeModules = [fullName + '/runtime'];
    }
    combinedStream.append(gulp.src(path.resolve(src, js))
      .pipe(modulex({
        modulex: {
          packages: packages
        },
        genDeps: false,
        excludeModules: excludeModules
      }))
      .pipe(kclean({
        files: [
          {
            src: path.resolve(src, debugJs),
            outputModule: fullName + '/' + mod
          }
        ]
      }))
      .pipe(replace(/@VERSION@/g, packageInfo.version))
      .pipe(wrapper({
        header: header
      }))
        .pipe(tap(function(file) {
            //console.log(111, file);
            var reg = /define\(("[^"]+",\s*\[[^\]]*\]),\s*function[^\{]+{/;
            var contents = file.contents.toString();
            var match = contents.match(reg)[1];
            contents = contents.replace(reg,
                        ';(function() {\n' +

                            'if(window.KISSY){\n ' +
                            'KISSY.add(' + match + ',function(S, require, exports, module){\n' +
                            ' _xt(require, exports, module);\n' +
                            '});\n ' +
                            '} else if (window.define){\n ' +
                            'define(' + match + ', _xt);\n' +
                            '}else{\n' +
                            'throw new Error("Can\'t found any module manager, such like Kissy CMD AMD SeaJS and etc.");\n' +
                            '};\n' +
                            'function _xt(require, exports, module) {')
                        .replace(/}\);$/,
                            '};\n' +
                            '})();'
                        );
            //console.log(contents);
            file.contents = new Buffer(contents);
        }))

      .pipe(gulp.dest(build))
      .pipe(filter(debugJs))
      .pipe(replace(/@DEBUG@/g, ''))
      .pipe(uglify())
      .pipe(rename(js))
      .pipe(gulp.dest(build)));
  });
  return combinedStream;
});

gulp.task('precompile-test', function () {
  var gulpXTemplate = require('gulp-xtemplate');
  return gulp.src('tests/browser/fixture/*.xtpl').pipe(gulpXTemplate({
    runtime: '../../../lib/runtime',
    truncatePrefixLen: process.cwd().length,
    wrap: false,
    XTemplate: require('./')
  })).pipe(gulp.dest('tests/browser/fixture/'));
});

gulp.task('default', ['xtemplate', 'xtemplate-standalone', 'precompile-test']);

gulp.task('xtemplate-standalone', function () {
  var CombinedStream = require('combined-stream');
  var combinedStream = CombinedStream.create();
  var packages = {};
  var fullName = 'xtemplate/' + packageInfo.version;
  packages[fullName] = {
    base: path.resolve(src)
  };

  var exportVer = packageInfo.version.replace(/\./g, '');

  var wrap = {
    index: {
      start: 'var XTemplate = (function(){ var module = {};\n',
      end: '\nreturn xtemplate' + exportVer + 'Index;\n})();'
    },
    runtime: {
      start: 'var XTemplateRuntime = (function(){ var module = {};\n',
      end: '\nreturn xtemplate' + exportVer + 'Runtime;\n})();'
    }
  };
  ['index', 'runtime'].forEach(function (mod) {
    var js = mod + '.js';
    var debugJs = mod + '-debug.js';
    var standaloneJs = mod + '-standalone.js';
    var standaloneDebugJs = mod + '-standalone-debug.js';
    var modWrap = wrap[mod];
    combinedStream.append(gulp.src(path.resolve(src, js))
      .pipe(modulex({
        modulex: {
          packages: packages
        }
      }))
      .pipe(kclean({
        files: [
          {
            src: path.resolve(src, debugJs),
            wrap: modWrap
          }
        ]
      }))
      .pipe(replace(/@VERSION@/g, packageInfo.version))
      .pipe(wrapper({
        header: header
      }))
      .pipe(rename(standaloneDebugJs))
      .pipe(gulp.dest(build))
      .pipe(replace(/@DEBUG@/g, ''))
      .pipe(uglify())
      .pipe(rename(standaloneJs))
      .pipe(gulp.dest(build)));
  });
  return combinedStream;
});

gulp.task('parser', function (callback) {
  require('child_process').exec('node node_modules/kison/bin/kison -g lib/compiler/parser-grammar.kison',
    function (error, stdout, stderr) {
      if (stdout) {
        console.log('stdout: ' + stdout);
      }
      if (stderr) {
        console.log('stderr: ' + stderr);
      }
      if (error) {
        console.log('exec error: ' + error);
      }
    }).on('exit', callback);
});

gulp.task('parser-dev', function (callback) {
  require('child_process').exec('node node_modules/kison/bin/kison -g lib/compiler/parser-grammar.kison --no-compressSymbol',
    function (error, stdout, stderr) {
      if (stdout) {
        console.log('stdout: ' + stdout);
      }
      if (stderr) {
        console.log('stderr: ' + stderr);
      }
      if (error) {
        console.log('exec error: ' + error);
      }
    }).on('exit', callback);
});

gulp.task('kg', function () {
  var fs = require('fs');
  var kgInfo = JSON.parse(fs.readFileSync('./kg.log'));
  var version = packageInfo.version;
  var CombinedStream = require('combined-stream');
  var stream = CombinedStream.create();
  stream.append(gulp.src('./build/runtime-debug.js')
    .pipe(rename('runtime.js'))
    .pipe(replace('"xtemplate/' + version + '/runtime"', '"kg/xtemplate/' + version + '/runtime"'))
    .pipe(gulp.dest(kgInfo.dest))
    .pipe(replace(/@DEBUG@/g, ''))
    .pipe(uglify())
    .pipe(rename('runtime-min.js'))
    .pipe(gulp.dest(kgInfo.dest))
    .pipe(gulp.dest(kgInfo.dest)));
  stream.append(gulp.src('./build/index-debug.js')
    .pipe(rename('index.js'))
    .pipe(replace('"xtemplate/' + version + '/index"', '"kg/xtemplate/' + version + '/index"'))
    .pipe(replace('"xtemplate/' + version + '/runtime"', '"kg/xtemplate/' + version + '/runtime"'))
    .pipe(gulp.dest(kgInfo.dest))
    .pipe(replace(/@DEBUG@/g, ''))
    .pipe(uglify())
    .pipe(rename('index-min.js'))
    .pipe(gulp.dest(kgInfo.dest))
    .pipe(gulp.dest(kgInfo.dest)));
  return stream;
});

