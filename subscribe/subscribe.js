'use strict';

var restClient = require('../libs/sentiloRestClient');
var bodyParser = require('body-parser');
var cookieParser = require("cookie-parser");
var getBody = require('raw-body');
var cors = require('cors');
var jsonParser = bodyParser.json();
var urlencParser = bodyParser.urlencoded({extended:true});
var onHeaders = require('on-headers');
var typer = require('media-typer');
var isUtf8 = require('is-utf8');
var url = require('url');

module.exports = function(RED) {
    
	function Subscribe(config) {
        RED.nodes.createNode(this, config);
        
        var node = this;
        
        node.name = config.name;
        node.server = RED.nodes.getNode(config.server);
        node.providerId = config.providerId;
        node.subscriptionType = config.subscriptionType;
        node.identifier = config.identifier;
        node.baseUrl = config.baseUrl;
        node.endpoint = config.endpoint;
        node.callbackUrl = config.callbackUrl;
        node.subscriptionType = config.subscriptionType;

        if (RED.settings.httpNodeRoot !== false) {
            this.errorHandler = (err, req, res, next) => {
                node.status({ fill: 'red', shape: 'dot', text: 'ERROR!' });
                resetStatus(node, 5000);
                node.error(err, msg);
                res.sendStatus(500);
            };

            this.callback = (req, res) => {
                node.status({ fill: 'green', shape: 'ring', text: 'Processing call...' });

                var msgid = RED.util.generateId();
                res._msgid = msgid;
                node.send({ _msgid: msgid, req: req, res: createResponseWrapper(node, res), payload: req.body });

                res.status(200).send();
                node.status({ fill: 'green', shape: 'dot', text: 'Success' });
                resetStatus(node, 5000);
            };

            var metricsHandler = (req, res, next) => { next(); }
            var httpMiddleware = (req, res, next) => { next(); }

            if (RED.settings.httpNodeMiddleware) {
                if (typeof RED.settings.httpNodeMiddleware === "function") {
                    httpMiddleware = RED.settings.httpNodeMiddleware;
                }
            }

            node.on("close",function() {
                var node = this;
                RED.httpNode._router.stack.forEach(function(route,i,routes) {
                    if (route.route && route.route.path === node.callbackUrl && route.route.methods[node.method]) {
                        routes.splice(i,1);
                    }
                });
            });
            
            node.on('input', (msg) => {
            	
                if (subscribeValidateRequiredFields(node, msg)) {
        
                    var callbackUri = url.parse(node.callbackUrl);
                    RED.httpNode.post(node.endpoint, cookieParser(), httpMiddleware, corsHandler, metricsHandler, jsonParser, urlencParser, rawBodyParser, this.callback, this.errorHandler);

                    var payload = {
                        'endpoint': node.callbackUrl
                    };
                    
                    var requestPath = '/subscribe';
                    switch(node.subscriptionType.toLowerCase()) {
                        case 'data':
                            if (node.identifier) {
                                requestPath += '/data/' + node.providerId + '/' + node.identifier;
                            } else {
                                requestPath += '/data/' + node.providerId;
                            }
                            break;
                        case 'order':
                            if (node.identifier) {
                                requestPath += '/order/' + node.providerId + '/' + node.identifier;
                            } else {
                                requestPath += '/order/' + node.providerId;
                            }
                            break;
                        case 'alarm':
                            requestPath += '/alarm/' + node.identifier;
                            break;
                    }

                    restClient.request(
                        'PUT',
                        node.server.host,
                        requestPath,
                        node.server.credentials.apiKey,
                        payload,
                        (responseObject) => {
                            node.status({ fill: 'blue', shape: 'ring', text: 'Ready' });
                        },
                        (errorMessage) => {
                            node.status({ fill: 'red', shape: 'dot', text: 'ERROR' });
                            node.error(errorMessage, msg);
                        }
                    );
                }
            });

            node.emit('input', {});
        } else {
            this.warn(RED._("httpin.errors.not-created"));
        }
        
	}
	
	function resetStatus(node, delay) {
        setTimeout(() => {
            node.status({ fill: 'blue', shape: 'ring', text: 'Ready' });
        }, delay);
    }
	
	function rawBodyParser(req, res, next) {
        if (req.skipRawBodyParser) { next(); } // don't parse this if told to skip
        if (req._body) { return next(); }
        req.body = "";
        req._body = true;

        var isText = true;
        var checkUTF = false;

        if (req.headers['content-type']) {
            var parsedType = typer.parse(req.headers['content-type'])
            if (parsedType.type === "text") {
                isText = true;
            } else if (parsedType.subtype === "xml" || parsedType.suffix === "xml") {
                isText = true;
            } else if (parsedType.type !== "application") {
                isText = false;
            } else if (parsedType.subtype !== "octet-stream") {
                checkUTF = true;
            } else {
                // applicatino/octet-stream
                isText = false;
            }
        }

        getBody(req, {
            length: req.headers['content-length'],
            encoding: isText ? "utf8" : null
        }, function (err, buf) {
            if (err) { return next(err); }
            if (!isText && checkUTF && isUtf8(buf)) {
                buf = buf.toString()
            }
            req.body = buf;
            next();
        });
    }

    function createResponseWrapper(node, res) {
        var wrapper = {
            _res: res
        };
        var toWrap = [
            "append",
            "attachment",
            "cookie",
            "clearCookie",
            "download",
            "end",
            "format",
            "get",
            "json",
            "jsonp",
            "links",
            "location",
            "redirect",
            "render",
            "send",
            "sendfile",
            "sendFile",
            "sendStatus",
            "set",
            "status",
            "type",
            "vary"
        ];
        toWrap.forEach(function(f) {
            wrapper[f] = function() {
                node.warn(RED._("httpin.errors.deprecated-call", { method: "msg.res." + f }));
                var result = res[f].apply(res, arguments);
                if (result === res) {
                    return wrapper;
                } else {
                    return result;
                }
            }
        });
        return wrapper;
    }

    function subscribeValidateRequiredFields(node, msg) {

        var valid = true;
    
        if(!node.server.host) {
            node.status({ fill: 'red', shape: 'dot', text: 'SETTINGS ERROR!' });
            node.error('Host field content is blanck in server connection with alias \'' + node.server.alias + '\'');
            if (msg) {
                node.error('Host field content is blanck in server connection with alias \'' + node.server.alias + '\'', msg);
            }
            valid = false;
        }
    
        if(!node.server.credentials.apiKey) {
            node.status({ fill: 'red', shape: 'dot', text: 'SETTINGS ERROR!' });
            node.error('API key field content is blank in server connection with alias \'' + node.server.alias + '\'');
            if (msg) {
                node.error('API key field content is blank in server connection with alias \'' + node.server.alias + '\'', msg);
            }
            valid = false;
        }
    
        if(!node.baseUrl) {
            node.status({ fill: 'red', shape: 'dot', text: 'SETTINGS ERROR!' });
            node.error('Base URL is mandatory. Please fill the public base url from your node-red server.');
            if (msg) {
                node.error('Base URL is mandatory. Please fill the public base url from your node-red server.', msg);
            }
            valid = false;
        }

        if(!node.endpoint) {
            node.status({ fill: 'red', shape: 'dot', text: 'SETTINGS ERROR!' });
            node.error('Enpoint is mandatory, and must start with /');
            if (msg) {
                node.error('Enpoint is mandatory, and must start with /', msg);
            }
            valid = false;
        }

        if(!node.callbackUrl) {
            node.status({ fill: 'red', shape: 'dot', text: 'SETTINGS ERROR!' });
            node.error('Callback URL is mandatory');
            if (msg) {
                node.error('Callback URL is mandatory', msg);
            }
            valid = false;
        }
    
        switch(node.subscriptionType.toLowerCase()) {
            case 'data':
            case 'order':
                if(!node.providerId) {
                    node.status({ fill: 'red', shape: 'dot', text: 'SETTINGS ERROR!' });
                    node.error('Provider Id field is mandatory when subscription type is DATA or ORDER');
                    if (msg) {
                        node.error('Provider Id field is mandatory when subscription type is DATA or ORDER', msg);
                    }
                    valid = false;
                }
                break;
            case 'alarm':
                if(!node.identifier) {
                    node.status({ fill: 'red', shape: 'dot', text: 'SETTINGS ERROR!' });
                    node.error('Alert Id field (id) is mandatory when subscription type is ALARM');
                    if (msg) {
                        node.error('Alert Id field (id) is mandatory when subscription type is ALARM', msg);
                    }
                    valid = false;
                }
                break;
        }
    
        return valid;
    }

    var corsHandler = (req, res, next) => { next(); }

    if (RED.settings.httpNodeCors) {
        corsHandler = cors(RED.settings.httpNodeCors);
        RED.httpNode.options("*", corsHandler);
    }	
	
    RED.nodes.registerType('subscribe', Subscribe);

}

