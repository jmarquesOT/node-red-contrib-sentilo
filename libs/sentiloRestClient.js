
module.exports = {
    
    request: function(method, host, path, apiKey, payload, callback, errorCallback) {

        var dataString = JSON.stringify(payload);
        var requestHostProperties = getRequestHostProperties(host);
        var options = getRequestOptions(method, requestHostProperties, path, apiKey, dataString);

        var protocol = require('http');
        if (requestHostProperties.protocol === 'https') {
            protocol = require('https');
        }

        var req = protocol.request(options, (res) => {

            res.setEncoding('utf-8');
            
            var responseString = '';

            res.on('data', (data) => {
                responseString += data;
            });

            res.on('end', () => {
                if(responseString) {
                    var responseObject = JSON.parse(responseString);
                    if(responseObject.code) {
                        errorCallback(responseObject.message);
                    } else {
                        callback(responseObject);
                    }
                } else {
                    callback(payload);
                }
            });

        });

        req.on('error', (e) => {
            errorCallback(e.message);
        });

        if(dataString) {
            req.write(dataString);
        }

        req.end();
    }
};

function getHeaders(method, apiKey, dataString) {

    var headers = {};

    if (method === 'GET') {
        headers = {
            'IDENTITY_KEY': apiKey
        };
    } else {
        headers = {
            'IDENTITY_KEY': apiKey,
            'Content-Type': 'application/json',
            'Content-Length': dataString.length
        };
    }

    return headers;
}

function getRequestOptions(method, requestHostProperties, path, apiKey, dataString) {
    
    var headers = getHeaders(method, apiKey, dataString);

    return {
        host: requestHostProperties.host,
        port: requestHostProperties.port,
        path: path,
        method: method,
        headers: headers
    };

}

function getRequestHostProperties(host) {

    var protocol = 'http';
    var port = 80;
    var targetHost = host;
    var hostTokens = host.split('://');
    
    if (hostTokens.length > 1) {
        protocol = tokens[0];
        targetHost = tokens[1];
    } 

    hostTokens = targetHost.split(':');
    if (hostTokens.length > 1) {
        targetHost = hostTokens[0];
        port = hostTokens[1];
    }
    
    return {
        'host' : targetHost,
        'port' : port,
        'protocol' : protocol
    };

}
