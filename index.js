#!/usr/bin/env node

const express = require('express')
    , session = require('express-session')  // https://github.com/expressjs/session
    , bodyParser = require('body-parser')
    , cookieParser = require('cookie-parser')
    , MemoryStore = require('memorystore')(session) // https://github.com/roccomuso/memorystore
    , path = require('path')
    , DSAuthCodeGrant = require('./lib/DSAuthCodeGrant')
    , passport = require('passport')
    , DocusignStrategy = require('passport-docusign')
    , dsConfig = require('./ds_configuration.js').config
    , commonControllers = require('./lib/commonControllers')
    , flash = require('express-flash')
    , helmet = require('helmet') // https://expressjs.com/en/advanced/best-practice-security.html
    , moment = require('moment')
    , csrf = require('csurf') // https://www.npmjs.com/package/csurf

    , eg002 = require('./lib/work/eg002SigningViaEmail')

    , eg006 = require('./lib/work/eg006EnvelopeDocs')
    , eg007 = require('./lib/work/eg007EnvelopeGetDoc')

;

const PORT = process.env.PORT || 5000
    , HOST = process.env.HOST || 'localhost'
    , max_session_min = 180
    , csrfProtection = csrf({ cookie: true })
;

let hostUrl = 'http://' + HOST + ':' + PORT
if (dsConfig.appUrl != '' && dsConfig.appUrl != '{APP_URL}') {hostUrl = dsConfig.appUrl}

let app = express()
    .use(helmet())
    .use(express.static(path.join(__dirname, 'public')))
    .use(cookieParser())
    .use(session({
        secret: dsConfig.sessionSecret,
        name: 'ds-eg03-session',
        cookie: {maxAge: max_session_min * 60000},
        saveUninitialized: true,
        resave: true,
        store: new MemoryStore({
            checkPeriod: 86400000 // prune expired entries every 24h
        })}))
    .use(passport.initialize())
    .use(passport.session())
    .use(bodyParser.urlencoded({ extended: true }))
    .use(((req, res, next) => {
        res.locals.user = req.user;
        res.locals.session = req.session;
        res.locals.dsConfig = dsConfig;
        res.locals.hostUrl = hostUrl; // Used by DSAuthCodeGrant#logout
        next()})) // Send user info to views
    .use(flash())
    .set('views', path.join(__dirname, 'views'))
    .set('view engine', 'ejs')
    // Add an instance of DSAuthCodeGrant to req
    .use((req, res, next) => {req.dsAuthCodeGrant = new DSAuthCodeGrant(req); next()})
    // Routes
    .get('/', commonControllers.indexController)
    .get('/ds/login', (req, res, next) => {req.dsAuthCodeGrant.login(req, res, next)})
    .get('/ds/callback', [dsLoginCB1, dsLoginCB2]) // OAuth callbacks. See below
    .get('/ds/logout', (req, res) => {req.dsAuthCodeGrant.logout(req, res)})
    .get('/ds/logoutCallback', (req, res) => {req.dsAuthCodeGrant.logoutCallback(req, res)})
    .get('/ds/mustAuthenticate', commonControllers.mustAuthenticateController)
    .get('/ds-return', commonControllers.returnController)
    .use(csrfProtection) // CSRF protection for the following routes

    .get('/eg002', eg002.getController)
    .post('/eg002', eg002.createController)

    .get('/eg006', eg006.getController)
    .post('/eg006', eg006.createController)
    .get('/eg007', eg007.getController)
    .post('/eg007', eg007.createController)

;

function dsLoginCB1 (req, res, next) {req.dsAuthCodeGrant.oauth_callback1(req, res, next)}
function dsLoginCB2 (req, res, next) {req.dsAuthCodeGrant.oauth_callback2(req, res, next)}

/* Start the web server */
if (dsConfig.dsClientId && dsConfig.dsClientId !== '{CLIENT_ID}' &&
    dsConfig.dsClientSecret && dsConfig.dsClientSecret !== '{CLIENT_SECRET}') {
    app.listen(PORT)
    console.log(`Listening on ${PORT}`);
    console.log(`Ready! Open ${hostUrl}`);
} else {
    console.log(`PROBLEM: You need to set the clientId (Integrator Key), and perhaps other settings as well. 
You can set them in the source file ds_configuration.js or set environment variables.\n`);
    process.exit(); // We're not using exit code of 1 to avoid extraneous npm messages.
}

// Passport session setup.
//   To support persistent login sessions, Passport needs to be able to
//   serialize users into and deserialize users out of the session.  Typically,
//   this will be as simple as storing the user ID when serializing, and finding
//   the user by ID when deserializing.  However, since this example does not
//   have a database of user records, the complete DocuSign profile is serialized
//   and deserialized.
passport.serializeUser  (function(user, done) {done(null, user)});
passport.deserializeUser(function(obj,  done) {done(null, obj)});

// Configure passport for DocusignStrategy
let docusignStrategy = new DocusignStrategy({
        production: dsConfig.production,
        clientID: dsConfig.dsClientId,
        clientSecret: dsConfig.dsClientSecret,
        callbackURL: hostUrl + '/ds/callback',
        state: true // automatic CSRF protection.
        // See https://github.com/jaredhanson/passport-oauth2/blob/master/lib/state/session.js
    },
    function _processDsResult(accessToken, refreshToken, params, profile, done) {
        // The params arg will be passed additional parameters of the grant.
        // See https://github.com/jaredhanson/passport-oauth2/pull/84
        //
        // Here we're just assigning the tokens to the account object
        // We store the data in DSAuthCodeGrant.getDefaultAccountInfo
        let user = profile;
        user.accessToken = accessToken;
        user.refreshToken = refreshToken;
        user.expiresIn = params.expires_in;
        user.tokenExpirationTimestamp = moment().add(user.expiresIn, 's'); // The dateTime when the access token will expire
        return done(null, user);
    }
);

/**
 * The DocuSign OAuth default is to allow silent authentication.
 * An additional OAuth query parameter is used to not allow silent authentication
 */
if (!dsConfig.allowSilentAuthentication) {
    // See https://stackoverflow.com/a/32877712/64904
    docusignStrategy.authorizationParams = function(options) {
        return {prompt: 'login'};
    }
}
passport.use(docusignStrategy);
