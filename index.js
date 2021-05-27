/**
 * @copyright		Yusup Hambali <supalpuket@gmail.com>
 * @license 		MIT
 */

let URL = require('url');
let child = require('child_process');
let path = require('path');
let fs = require('fs');


const run_php = ({ bin, script, docRoot, req, env }, processResult) => {
	let url = URL.parse(req.url)
	let scriptFile = path.join(docRoot, script);
	let pathinfo = '';

	env = Object.assign({
		SERVER_SIGNATURE: 'NodeJS server at localhost',
		PATH_INFO: pathinfo,
		SCRIPT_NAME: script,
		SCRIPT_FILENAME: scriptFile,
		SCRIPT_URL: req.url,
		REQUEST_URI: req.url,
		REQUEST_METHOD: req.method,
		QUERY_STRING: url.query || '',
		CONTENT_TYPE: req.get('Content-Type') || '',
		CONTENT_LENGTH: req.get('Content-Length') || 0,
		REMOTE_USER: '',
		SERVER_SOFTWARE: 'NodeJS',
		SERVER_NAME: req.headers.host.split(':')[0] || 'localhost',
		SERVER_ADDR: req.socket.address().host || '127.0.0.1',
		SERVER_PORT: req.socket.address().port || 8011,
		GATEWAY_INTERFACE: 'CGI/1.1',
		SERVER_PROTOCOL: '',
		REMOTE_ADDR: req.ip || '',
		REMOTE_PORT: '',
		DOCUMENT_ROOT: docRoot,
		REDIRECT_STATUS: 1
	}, env);

	Object.keys(req.headers).map(x => env['HTTP_' + x.toUpperCase().replace('-', '_')] = req.headers[x]);

	let php, res = '', err = '';

	php = child.spawn(bin, [], { env });

	php.stdin.on('error', err => {
		console.error("Error from php cgi: " + err)
	});

	req.pipe(php.stdin);
	req.resume();

	php.stdout.on('data', data => {
		res += data.toString();
	});

	php.stderr.on('data', data => {
		err += data.toString();
	});

	php.on('error', err => {

		console.error("error", err);
	});

	php.on('exit', _ => {
		php.stdin.end();
		processResult(res);
	});
}

const extractHeader = (hdrLine, headers={}) => {
	let m = hdrLine.split(': ');
	if (m.length < 2) {
		return;
	}
	if (headers[m[0]]) {
		if (!Array.isArray(headers[m[0]])) {
			headers[m[0]] = [headers[m[0]]];
		}
		headers[m[0]].push(headers[m[1]]);
	}
	else {
		headers[m[0]] = m[1];
	}
}

exports.cgi = (opts = {}) => {
	if (typeof opts === 'string') {
		opts = { docRoot: opts };
	}

	if (!opts.script) {
		opts.script = 'index.php';
	}

	console.info('[phpcgi] scriptFile: ' + path.join(opts.docRoot, opts.script));

	return (req, res, next) => {
		req.pause();

		const processResult = (result) => {
			let pos;
			let headers = {};

			while ((pos = result.indexOf('\r\n')) > -1) {
				headerLine = result.substr(0, pos);
				result = result.substr(pos + 2);
				extractHeader(headerLine, headers);
			}

			for ([key, value] of Object.entries(headers)) {
				res.setHeader(key, value);

				if (key === 'Status') {
					res.statusCode = parseInt(value);
				}
			}

			res.status(res.statusCode).send(result);
			res.end();
		};

		opts.req = req
		fs.stat(path.join(opts.docRoot, opts.script), (err, stat) => {
			if (err || !stat.isFile) next();
			opts.script = '/' + opts.script.replace(/^\/+/, '');
			run_php(opts, processResult);
		});
	};
};
