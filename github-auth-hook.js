'use strict';

const { User, AuthenticationRequired } = require('unleash-server');

const passport = require('passport');
const GitHubStrategy = require('passport-github').Strategy;

passport.use(
    new GitHubStrategy({
            clientID: process.env.GITHUB_CLIENT_ID,
            clientSecret: process.env.GITHUB_CLIENT_SECRET,
            callbackURL: process.env.GITHUB_CALLBACK_URL,
            scope: ['read:org'],
        },

        (accessToken, refreshToken, profile, done) => {
            console.log("Access token: " + accessToken)
            if (!profile.emails) {
                // user can choose to not display any email, then use a default one as unleash required it
                profile.emails.push(`${displayName}@unknown.com`);
            }
            done(
                null,
                new User({
                    name: profile.displayName,
                    email: profile.emails[0].value,
                })
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
        passport.authenticate('github', {
            failureRedirect: `${context}/api/admin/error-login`,
        }),
        (req, res) => {
            // Successful authentication, redirect to your app.
            res.redirect(`${context}/`);
        }
    );

    app.use('/api/admin/', (req, res, next) => {
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