'use strict';

const unleash = require('unleash-server');
const gitHubOAuth = require('./github-auth-hook');

unleash.start({
    adminAuthentication: 'custom',
    preRouterHook: gitHubOAuth
}).then(server => {
    console.log(
        `Unleash started on http://localhost:${server.app.get('port')}`
    );
});