'use strict';

const { User, AuthenticationRequired } = require('unleash-server');

const passport = require('passport');
const request = require('request');
const GitHubStrategy = require('passport-github').Strategy;

let githubOrg = process.env.GITHUB_ORG ? process.env.GITHUB_ORG : 'rhdt-toggles-test';
let githubOrgTeam = process.env.GITHUB_ORG_TEAM ? process.env.GITHUB_ORG_TEAM : 'toggles-admin-test';

passport.use(
    new GitHubStrategy({
            clientID: process.env.GITHUB_CLIENT_ID,
            clientSecret: process.env.GITHUB_CLIENT_SECRET,
            callbackURL: process.env.GITHUB_CALLBACK_URL,
            scope: ['read:org'],
        },

        (accessToken, refreshToken, profile, done) => {
            if (!profile.emails) {
                // user can choose to not display any email, then use a default one as unleash required it
                profile.emails.push(`${displayName}@unknown.com`);
            }
            // Successful authentication, now check if the authenticated user is a member of the GH org/team
            console.log(`Fetching teams on https://api.github.com/orgs/${githubOrg}/teams with access token ${accessToken}`);
            request({
                    url: `https://api.github.com/orgs/${githubOrg}/teams`,
                    headers: {
                        'User-Agent': 'toggles-admin',
                        'Authorization': 'Bearer ' + accessToken
                    }
                },
                function(error, response, body) {
                    if (error) {
                        console.error('access to GH org failed:', error);
                        return done(error);
                    } else if (response.statusCode != 200) {
                        console.error('access to GH org failed: ', response.statusCode, response.body);
                        return done(null, false, { message: `unable to get the teams in the ${githubOrg} organization.` });
                    }
                    console.log('access to GH org done. Server responded with:', response.body);
                    let jsonBody = JSON.parse(response.body)
                    jsonBody.forEach(team => {
                        if (team.name == githubOrgTeam) {
                            console.log('found team URL: ', team.members_url);
                            let teamMemberURL = team.members_url.replace("{/member}", `/${profile.username}`);
                            console.log('using team URL: ', teamMemberURL);
                            request({
                                    url: teamMemberURL,
                                    headers: {
                                        'User-Agent': 'toggles-admin',
                                        'Authorization': 'Bearer ' + accessToken
                                    }
                                },
                                function(error, response, body) {
                                    if (error) {
                                        console.error('access to GH team failed:', error);
                                        return done(error);
                                    } else if (response.statusCode != 204) {
                                        console.error('access to GH team failed: ', response.statusCode, response.body);
                                        return done(null, false, { message: 'User does not belong to the admin team.' });
                                    }
                                    // user belongs to the org/team
                                    done(null,
                                        new User({
                                            name: profile.displayName,
                                            email: profile.emails[0].value,
                                            accessToken: accessToken,
                                        })
                                    );
                                }
                            );
                        }
                    });
                }
            );


        }
    )
);



function enableGitHubOAuth(app) {

    app.use(passport.initialize());
    app.use(passport.session());

    passport.serializeUser((user, done) => {
        done(null, user);
    });
    passport.deserializeUser((user, done) => {
        done(null, user);
    });

    app.get('/api/admin/login', passport.authenticate('github'));

    let context = process.env.TOGGLES_CONTEXT ? process.env.TOGGLES_CONTEXT : '';

    app.get(
        '/api/auth/callback',
        passport.authorize('github', {
            failureRedirect: `${context}/api/admin/error-login`,
        }),
        (req, res) => {
            // redirect to toggles admin app.
            res.redirect(`${context}/`);
        });

    app.use('/api/admin/', (req, res, next) => {
        console.log(`Calling /api/admin with req=${req} and res=${res}`)
        if (req.user) {
            next();
        } else {
            // Instruct unleash-frontend to pop-up auth dialog
            return res
                .status('401')
                .json(
                    new AuthenticationRequired({
                        path: 'api/admin/login',
                        type: 'custom',
                        message: `You have to identify yourself in order to use Unleash. 
                        Click the button and follow the instructions.`,
                    })
                )
                .end();
        }
    });
}

module.exports = enableGitHubOAuth;