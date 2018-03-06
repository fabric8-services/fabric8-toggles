'use strict';

const unleash = require('unleash-server');

let devMode = process.env.DEV_MODE ? (process.env.DEV_MODE == 'true') : false;

if (devMode) {
    unleash.start({
        adminAuthentication: 'none',
    }).then(server => {
        console.log(
            `Unleash started on port ${server.app.get('port')}`
        );
    });  
} else {
    const gitHubOAuth = require('./github-auth-hook');
    unleash.start({
        adminAuthentication: 'custom',
        preRouterHook: gitHubOAuth
    }).then(server => {
        console.log(
            `Unleash started on port ${server.app.get('port')}`
        );
    });
}