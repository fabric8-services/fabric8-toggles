'use strict';

const { test } = require('ava');
const express = require('express');
const request = require('supertest');
const enableGitHubOAuth = require('./github-auth-hook');

test('should return 401 for the first call to /api/admin API', t => {
    t.plan(1);
    const app = express();
    enableGitHubOAuth(app);

    return request(app)
        .get(`/api/admin`)
        .expect(401)
        .expect(res => {
            t.true(
                res.body.message.indexOf(
                    'You have to identify yourself in order to use Unleash.'
                ) >= 0
            );
        });
});

test('should redirect to GH login page', t => {
    t.plan(3);
    const app = express();
    enableGitHubOAuth(app);

    return request(app)
        .get(`/api/admin/login`)
        .expect(302)
        .expect(res => {
            t.true(res.header.location.indexOf('code') >= 0);
            t.true(res.header.location.indexOf('scope=read') >= 0);
            t.true(res.header.location.indexOf('client_id') >= 0);
        });
});

test('should go back to callback', t => {
    t.plan(3);
    const app = express();
    enableGitHubOAuth(app);

    return request(app)
        .get(`/api/auth/callback`)
        .expect(302)
        .expect(res => {
            t.true(res.header.location.indexOf('code') >= 0);
            t.true(res.header.location.indexOf('scope=read') >= 0);
            t.true(res.header.location.indexOf('client_id') >= 0);
        });
});
