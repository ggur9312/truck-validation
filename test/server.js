var http = require('http');
var fs = require('fs');
var path = require('path');

var DETAIL_HTML = '<html><body>' +
  '<table><tr><td>TOTE001</td><td>x</td><td>x</td><td>x</td><td>업체A</td><td>x</td><td>x</td><td>7</td></tr></table>' +
  '<table>' +
  '<tr><td>x</td><td>x</td><td>x</td><td>상품A</td><td>BAR001</td><td>2</td></tr>' +
  '<tr><td>x</td><td>x</td><td>x</td><td>상품B</td><td>BAR002</td><td>1</td></tr>' +
  '</table>' +
  '</body></html>';

var TYPE_HTML = '<html><body>' +
  '<table><tr><td>x</td><td>x</td><td>x</td><td>x</td></tr></table>' +
  '<table><tr><td>x</td><td>x</td><td>x</td><td>택배</td></tr></table>' +
  '</body></html>';

var DETAIL_HTML_2 = '<html><body>' +
  '<table><tr><td>TOTE002</td><td>x</td><td>x</td><td>x</td><td>업체B</td><td>x</td><td>x</td><td>3</td></tr></table>' +
  '<table><tr><td>x</td><td>x</td><td>x</td><td>상품C</td><td>BAR003</td><td>3</td></tr></table>' +
  '</body></html>';

var TYPE_HTML_2 = '<html><body>' +
  '<table><tr><td>x</td><td>x</td><td>x</td><td>x</td></tr></table>' +
  '<table><tr><td>x</td><td>x</td><td>x</td><td>트럭</td></tr></table>' +
  '</body></html>';

var routes = {
  '/detail/TOTE001': DETAIL_HTML,
  '/type/TOTE001': TYPE_HTML,
  '/detail/TOTE002': DETAIL_HTML_2,
  '/type/TOTE002': TYPE_HTML_2
};

var server = http.createServer(function(req, res){
  if (routes[req.url]) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(routes[req.url]);
    return;
  }
  var file = req.url === '/' ? '/fixture.html' : req.url;
  var filePath = path.join(__dirname, file);
  fs.readFile(filePath, function(err, data){
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(data);
  });
});

var PORT = 8934;
server.listen(PORT, function(){ console.log('listening on ' + PORT); });
