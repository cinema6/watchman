#! /usr/bin/env node

var fs      = require('fs'),
    request = require('request'),
    url     = require('url'),
    q       = require('q'),
    BeeswaxHelper = require('../tests/helpers/BeeswaxHelper'),
    task    = {};
    //authUrl   = server + '/api/auth/login',
    //queryUrl  = server + '/api/analytics/campaigns';

function initTask(task) {
    var creds = require(process.env.HOME + '/.c6api.json'), u;
    
    if (!process.argv[2]){
        throw new Error('API Request URL is required!');
    }
    
    u = url.parse(process.argv[2],true);
    
    if (creds[u.host]) {
        task.username   = creds[u.host].username;
        task.password   = creds[u.host].password;
    } else {
        task.username   = creds.username;
        task.password   = creds.password;
    }

    if (!task.username) {
        throw new Error('Username is required!');
    }

    if (!task.password) {
        throw new Error('Password is required!');
    }

    task.authUrl = u.protocol + '//' + u.host + '/api/auth/login';
    task.rqsUrl  = u.href;
    task.beeswax = new BeeswaxHelper();

    return task;
}

function authenticate(task) {

    var loginOpts = {
        url: task.authUrl,
        rejectUnauthorized : false,
        json: {
            email       : task.username,
            password    : task.password
        },
        jar : true
    }, deferred = q.defer();
   
    request.post(loginOpts, function(error, response, body) {
        if (error) {
            console.log('Login error: ', error);
            return deferred.reject(error);
        }
        else if (response.statusCode !== 200) {
            console.log('Login failure: ', response.statusCode);
            console.log(body);
            return deferred.reject(body);
        }
        
        return deferred.resolve(task);
    });

    return deferred.promise;
}

function getAdvertisers(task) {
    var opts = {
        url: task.rqsUrl + 'api/account/advertisers?fields=name,externalIds,beeswaxIds',
        rejectUnauthorized : false,
        jar : true,
        json : true
    }, deferred = q.defer();
   
    request.get(opts, function(error, response, body) {
        if (error) {
            console.log(' Error: ', error);
            return deferred.reject(error);
        }
        else if (response.statusCode !== 200) {
            console.log(' Failed: ', response.statusCode);
            console.log(body);
            return deferred.reject(body);
        }
        task.advertisers = body;  
        return deferred.resolve(task);
    });
    
    return deferred.promise;
}

function getBeeswaxStuff(task){
    return q.all(task.advertisers.filter(function(adv){
        return ((adv.externalIds && adv.externalIds.beeswax) || 
            (adv.beeswaxIds && adv.beeswaxIds.advertiser))
    }).map(function(adv){
        var advertiserId = ((adv.externalIds && adv.externalIds.beeswax) || 
            (adv.beeswaxIds && adv.beeswaxIds.advertiser));
        console.log('SEARCH ADVERTISER ID:',advertiserId);
        return q.all([
                task.beeswax.api.advertisers.find( advertiserId ),
                task.beeswax.api.campaigns.queryAll({ advertiser_id : advertiserId }),
                task.beeswax.api.creatives.queryAll({ advertiser_id : advertiserId })
            ])
            .spread(function(bwad,bwcamp,bwcreat){
                adv.beeswax = {
                    advertiser_id : advertiserId,
                    advertiser : bwad.payload ? true : false,
                    campaign : bwcamp.payload[0] ? true : false,
                    creative : bwcreat.payload[0] ? true : false
                };
            });
    }))
    .then(function(ads){
        console.log('GIT ADS:',ads);
        task.advertisers = ads.filter(function(ad){
            return ads.beeswax && ads.beeswax.advertiser && ( !ads.beeswax.campaign && !ads.beeswax.creative);
        });
        return task;
    });
}

q(initTask(task))
.then(authenticate)
.then(getAdvertisers)
.then(getBeeswaxStuff)
.then(function(task){
    console.log(task.advertisers);
})
.catch(function(e){
    console.log(e);
});

