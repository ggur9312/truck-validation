var C128_TABLE = ["212222","222122","222221","121223","121322","131222","122213","122312","132212","221213","221312","231212","112232","122132","122231","113222","123122","123221","223211","221132","221231","213212","223112","312131","311222","321122","321221","312212","322112","322211","212123","212321","232121","111323","131123","131321","112313","132113","132311","211313","231113","231311","112133","112331","132131","113123","113321","133121","313121","211331","231131","213113","213311","213131","311123","311321","331121","312113","312311","332111","314111","221411","431111","111224","111422","121124","121421","141122","141221","112214","112412","122114","122411","142112","142211","241211","221114","413111","241112","134111","111242","121142","121241","114212","124112","124211","411212","421112","421211","212141","214121","412121","111143","111341","131141","114113","114311","411113","411311","113141","114131","311141","411131","211412","211214","211232"];
var C128_STOP = '2331112';

function code128Values(text){
  var values = [104];
  for (var i = 0; i < text.length; i++) {
    var code = text.charCodeAt(i) - 32;
    if (code < 0 || code > 94) throw new Error('unsupported barcode char');
    values.push(code);
  }
  var checksum = values[0];
  for (var j = 1; j < values.length; j++) checksum += values[j] * j;
  values.push(checksum % 103);
  return values;
}
function code128Patterns(text){
  var patterns = code128Values(text).map(function(v){ return C128_TABLE[v]; });
  patterns.push(C128_STOP);
  return patterns;
}

function assert(cond, msg){ if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; } else { console.log('OK:', msg); } }

// Table structural integrity
assert(C128_TABLE.length === 106, 'table has 106 entries');
C128_TABLE.forEach(function(p, i){
  var sum = p.split('').reduce(function(a,c){ return a + Number(c); }, 0);
  assert(sum === 11 && p.length === 6, 'row ' + i + ' sums to 11 (got ' + sum + ')');
});
assert(C128_STOP.split('').reduce(function(a,c){return a+Number(c);},0) === 13, 'stop pattern sums to 13');

// Known checksum: "HI" in Code128B -> start(104) + H(40)*1 + I(41)*2 = 104+40+82=226 -> 226%103=20
var v = code128Values('HI');
assert(v[0] === 104, 'HI start value is 104 (Start B)');
assert(v[1] === 40 && v[2] === 41, 'HI char values correct');
assert(v[3] === 20, 'HI checksum is 20 (got ' + v[3] + ')');

var patterns = code128Patterns('HI');
assert(patterns.length === 5, 'HI patterns: start+2 chars+checksum+stop = 5');
assert(patterns[4] === C128_STOP, 'last pattern is stop');

// control code round trip
['TVCS','TVCW','TVCR'].forEach(function(code){
  var vals = code128Values(code);
  assert(vals.every(function(x){ return x >= 0 && x <= 106; }), code + ' values in range');
});

// out-of-range char throws
try { code128Values(String.fromCharCode(200)); assert(false, 'should throw on unsupported char'); }
catch(e){ assert(true, 'throws on unsupported char'); }

console.log(process.exitCode ? 'SOME TESTS FAILED' : 'ALL TESTS PASSED');
