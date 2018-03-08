'use strict';

const { User, AuthenticationRequired } = require('unleash-server');

const passport = require('passport');
const request = require('request');
const GitHubStrategy = require('passport-github').Strategy;

const githubOrg = process.env.GITHUB_ORG
    ? process.env.GITHUB_ORG
    : 'rhdt-toggles-test';
const githubTeam = process.env.GITHUB_TEAM
    ? process.env.GITHUB_TEAM
    : 'toggles-admin-test';

passport.use(
    new GitHubStrategy(
        {
            clientID: process.env.GITHUB_CLIENT_ID,
            clientSecret: process.env.GITHUB_CLIENT_SECRET,
            callbackURL: process.env.GITHUB_CALLBACK_URL,
            scope: ['read:org'],
        },

        (accessToken, refreshToken, profile, done) => {
            if (!profile.emails) {
                // user can choose to not display any email, then use a default one as unleash required it
                console.log(`${profile.displayName} has no email provided`);
                profile.emails = [];
                profile.emails.push({
                    value: `${profile.displayName}@unknown.com`,
                });
                console.log(
                    `Added ${
                        profile.displayName
                    }@unknown.com to profile emails: ${profile.emails[0].value}`
                );
            }
            console.log(
                `name ${profile.displayName} email ${profile.emails[0].value}`
            );
            const user = new User({
                name: profile.displayName,
                email: profile.emails[0].value,
            });

            // Successful authentication, now check if the authenticated user is a member of the GH org/team, unless `dev mode` is enabled
            console.log(
                `Fetching teams on https://api.github.com/orgs/${githubOrg}/teams`
            );
            request(
                {
                    url: `https://api.github.com/orgs/${githubOrg}/teams`,
                    headers: {
                        'User-Agent': 'toggles-admin',
                        Authorization: `Bearer ${accessToken}`,
                    },
                },
                (error, response) => {
                    if (error) {
                        console.error('access to GH org failed:', error);
                        return done(null, false, { message: error });
                    } else if (response.statusCode !== 200) {
                        console.error(
                            'access to GH org failed: ',
                            response.statusCode,
                            response.body
                        );
                        return done(null, false, {
                            message: `Unable to get the teams in the ${githubOrg} organization. Please contact your team admin and ask her to add you.`,
                        });
                    }
                    // console.log('access to GH org done. Server responded with:', response.body);
                    const jsonBody = JSON.parse(response.body);
                    jsonBody.forEach(team => {
                        if (team.name === githubTeam) {
                            const teamMemberURL = team.members_url.replace(
                                '{/member}',
                                `/${profile.username}`
                            );
                            console.log(
                                `using team URL: ${teamMemberURL} to check for user '${
                                    profile.username
                                }' in team '${githubTeam}'... `
                            );
                            request(
                                {
                                    url: teamMemberURL,
                                    headers: {
                                        'User-Agent': 'toggles-admin',
                                        Authorization: `Bearer ${accessToken}`,
                                    },
                                },
                                (err, res) => {
                                    if (err) {
                                        console.error(
                                            'access to GH team failed:',
                                            err
                                        );
                                        return done(null, false, {
                                            message: err,
                                        });
                                    } else if (res.statusCode !== 204) {
                                        console.error(
                                            'access to GH team failed: ',
                                            res.statusCode,
                                            res.body
                                        );
                                        return done(null, false, {
                                            message: `User does not belong to the ${githubTeam} team. Please contact your team admin and ask her to add you.`,
                                        });
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

    const context = process.env.TOGGLES_CONTEXT
        ? process.env.TOGGLES_CONTEXT
        : '';

    // use custom callback http://www.passportjs.org/docs/authenticate/#custom-callback to better deal with error message
    app.get('/api/auth/callback', (req, res, next) => {
        passport.authenticate('github', (err, user, info) => {
            console.log(
                `Calling /api/auth/callback with session user=${user}, info=${info} and error=${err}`
            );
            if (user) {
                req.session.error = null; // reset the error if the a previous session is used
                req.session.user = user;
            } else {
                // if no user, display error
                if (info) {
                    const message = info.message;
                    req.session.error = message;
                }
                req.logout();
            }
            return res.redirect(`${context}/`);
        })(req, res, next);
    });

    app.get('/api/admin/user/logout', (req, res) => {
        // without that route defined, unleash admin will redirect to logout without being proxy-aware
        console.log('Log out');
        if (req.session) {
            req.session = null;
        }
        return res.redirect(`${context}/`);
    });

    app.use('/api/admin/', (req, res, next) => {
        // console.log(`Calling /api/admin with session user=${req.session.user} and error=${req.session.error}`)
        if (req.session && req.session.error) {
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
        } else if (req.session && req.session.user) {
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
}

module.exports = enableGitHubOAuth;
