'use strict';

const { User, AuthenticationRequired } = require('unleash-server');

const passport = require('passport');
const request = require('request');
const GitHubStrategy = require('passport-github').Strategy;

let githubOrg = process.env.GITHUB_ORG ? process.env.GITHUB_ORG : 'rhdt-toggles-test';
let githubTeam = process.env.GITHUB_TEAM ? process.env.GITHUB_TEAM : 'toggles-admin-test';

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
            let user = new User({
                name: profile.displayName,
                email: profile.emails[0].value,
            });

            // Successful authentication, now check if the authenticated user is a member of the GH org/team, unless `dev mode` is enabled
            console.log(`Fetching teams on https://api.github.com/orgs/${githubOrg}/teams`);
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
                        return done(null, false, { message: error });
                    } else if (response.statusCode != 200) {
                        console.error('access to GH org failed: ', response.statusCode, response.body);
                        return done(null, false, { message: `Unable to get the teams in the ${githubOrg} organization. Please contact your team admin and ask her to add you.` });
                    }
                    //console.log('access to GH org done. Server responded with:', response.body);
                    let jsonBody = JSON.parse(response.body)
                    jsonBody.forEach(team => {
                        if (team.name == githubTeam) {
                            let teamMemberURL = team.members_url.replace("{/member}", `/${profile.username}`);
                            console.log(`using team URL: ${teamMemberURL} to check for user '${profile.username}' in team '${githubTeam}'... `);
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
                                        return done(null, false, { message: error });
                                    } else if (response.statusCode != 204) {
                                        console.error('access to GH team failed: ', response.statusCode, response.body);
                                        return done(null, false, { message: `User does not belong to the ${githubTeam} team. Please contact your team admin and ask her to add you.` });
                                    }
                                    // user belongs to the org/team
                                    done(null, user);
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

    // use custom callback http://www.passportjs.org/docs/authenticate/#custom-callback to better deal with error message
    app.get('/api/auth/callback', (req, res, next) => {
        passport.authenticate('github', (err, user, info) => {
            // console.log(`Calling /api/auth/callback with session user=${user}, info=${info} and error=${err}`)
            let message = info.message;
            if (!user) {
                req.session.error = message;
                req.logout();
            } else {
                req.session.error = null; // reset the error if the a previous session is used
                req.session.user = user;
            }
            return res.redirect(`${context}/`);
        })(req, res, next);
    });

    app.use('/api/admin/', (req, res, next) => {
        // console.log(`Calling /api/admin with session user=${req.session.user} and error=${req.session.error}`)
        if (req.session.error) {
            // todo with 403 and AuthorizationRequired - once the ui supports it
            return res
                .status('401')
                .json(
                    new AuthenticationRequired({
                        path: `${context}/api/admin/login`,
                        type: 'none',
                        message: req.session.error,
                    })
                )
                .end();
        } else if (req.session.user) {
            req.user = req.session.user;
            next();
        } else {
            // Instruct unleash-frontend to pop-up auth dialog
            return res
                .status('401')
                .json(
                    new AuthenticationRequired({
                        path: `${context}/api/admin/login`,
                        type: 'custom',
                        message: `You have to identify yourself in order to use Unleash. 
                        Click the button and follow the instructions.`,
                    })
                )
                .end();
        }
    });
    app.get('/api/admin/user/logout', (req, res, next) => {
        // without that route defined, unleash admin will redirect to logout without being proxy-aware
        return res.redirect(`${context}/admin/user/logout`);
    });
}

module.exports = enableGitHubOAuth;