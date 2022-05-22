/**
 * @copyright		Yusup Hambali <supalpuket@gmail.com>
 * @license 		MIT
 */

const path = require('path')
const fs = require('fs')


const phpcgi = ({ bin = 'php-cgi', script, docRoot, req, env }) => {
  let scriptFile = path.join(docRoot, script)
  let pathinfo = '';

  env = Object.assign({
    PATH_INFO: pathinfo,
    SCRIPT_NAME: script,
    SCRIPT_FILENAME: scriptFile,
    SCRIPT_URL: req.url,
    REQUEST_URI: req.url,
    REQUEST_METHOD: req.method,
    QUERY_STRING: req._parsedUrl.query,
    CONTENT_TYPE: req.headers['content-type'],
    CONTENT_LENGTH: req.headers['content-length'],
    SERVER_SOFTWARE: 'NodeJS/PHPCGI',
    SERVER_NAME: req.headers.host.split(':')[0],
    SERVER_ADDR: req.socket.address().address,
    SERVER_PORT: req.socket.address().port,
    GATEWAY_INTERFACE: 'CGI/1.1',
    REMOTE_ADDR: req.connection.remoteAddress,
    REMOTE_PORT: req.connection.remotePort,
    DOCUMENT_ROOT: docRoot,
    REDIRECT_STATUS: 1,
    X_ORIGINAL_URL: req.originalUrl,
  }, env)

  Object.keys(req.headers).map(x => env['HTTP_' + x.toUpperCase().replace('-', '_')] = req.headers[x])

  let res = '', err = '';
  const process = require('child_process').spawn(bin, [], { env })

  process.stdin.on('error', err => {
    console.error("[node-phpcgi] Error from php cgi: " + err)
  })

  req.pipe(process.stdin)
  req.resume()

  process.stdout.on('data', data => {
    res += data.toString()
  })

  process.stderr.on('data', data => {
    err += data.toString()
  })

  process.on('error', err => {
    console.error("[node-phpcgi] Error from php cgi: " + err)
  })

  return new Promise((resolve, reject) => {
    process.on('exit', _ => {
      process.stdin.end()
      resolve(res)
    })
  })
}


let headers = {}

const extractHeader = (hdrLine) => {
  const pair = hdrLine.split(': ')

  if (pair.length < 2) {
    return
  }

  if (headers[pair[0]]) {
    if (!Array.isArray(headers[pair[0]])) {
      headers[pair[0]] = [headers[pair[0]]]
    }
    headers[pair[0]].push(headers[pair[1]])
  }
  else {
    headers[pair[0]] = pair[1]
  }
}

const setHeaders = (result, response) => {
  headers = {}

  let pos
  while ((pos = result.contents.indexOf('\r\n')) > -1) {
    let headerLine = result.contents.substr(0, pos)
    result.contents = result.contents.substr(pos + 2)

    if (!headerLine)
      break

    extractHeader(headerLine)
  }

  for (let [key, value] of Object.entries(headers)) {
    response.setHeader(key, value)

    if (key === 'Status') {
      response.statusCode = parseInt(value)
    }
  }
}

const processResult = (contents, res) => {
  const result = { contents }
  setHeaders(result, res)
  res.end(result.contents)
}

module.exports = (opts = {}) => {
  if (typeof opts === 'string')
    opts = { docRoot: opts }

  if (opts.docRoot[0] !== '/' && !opts.docRoot.match(/^[A-z]:/))
    opts.docRoot = path.join(process.cwd(), opts.docRoot)

  if (!opts.script)
    opts.script = 'index.php';

  console.info('[node-phpcgi] scriptFile: ' + path.join(opts.docRoot, opts.script))

  return (req, res, next) => {
    opts.req = req
    req.pause()

    fs.stat(path.join(opts.docRoot, opts.script), (err, stat) => {
      if (err || !stat.isFile) next()
      opts.script = '/' + opts.script.replace(/^\/+/, '')
      phpcgi(opts).then(c => processResult(c, res))
    })
  }
}
