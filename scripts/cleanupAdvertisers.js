var request = require('request'),
    url     = require('url'),
    q       = require('q'),
    path    = require('path'),
    BeeswaxClient = require('beeswax-client'),
    task    = {};

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
   
    var bwEnv = u.host.match(/staging/) ? 'test' : 'prod';
    var bwCreds = require(path.join(process.env.HOME,'.bw.json'))[bwEnv];
    
    task.beeswax = new BeeswaxClient({ apiRoot : bwCreds.hostname, creds : bwCreds });

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
            return deferred.reject(error);
        }
        else if (response.statusCode !== 200) {
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
            return deferred.reject(error);
        }
        else if (response.statusCode !== 200) {
            return deferred.reject(body);
        }
        task.advertisers = body;  
        return deferred.resolve(task);
    });
    
    return deferred.promise;
}

function getBeeswaxStuff(task){
    var beeswaxAdvertisers = task.advertisers.filter(function(adv){
        return ((adv.externalIds && adv.externalIds.beeswax) || 
        (adv.beeswaxIds && adv.beeswaxIds.advertiser));
    });

    //var count = 0;

    function lookupAdvertiser(){
        var adv = beeswaxAdvertisers.shift();
        if (!adv) {
            return task;
        }

        //if (count++ === 25) {
        //    return task;
        //}
        
        var advertiserId = ((adv.externalIds && adv.externalIds.beeswax) || 
            (adv.beeswaxIds && adv.beeswaxIds.advertiser));
        console.log('Lookup beeswax data for ', adv.name, ' [', advertiserId, ']');
        return q.all([
            task.beeswax.advertisers.find( advertiserId ),
            task.beeswax.campaigns.queryAll({ advertiser_id : advertiserId }),
            task.beeswax.creatives.queryAll({ advertiser_id : advertiserId })
        ])
        .spread(function(bwad,bwcamp,bwcreat){
            adv.beeswax = {
                advertiser_id : advertiserId,
                advertiser : bwad.payload ? true : false,
                campaign : bwcamp.payload[0] ? true : false,
                creative : bwcreat.payload[0] ? true : false
            };

            return lookupAdvertiser();
        });
    }

    return lookupAdvertiser();
}

function cleanseAdvertiser(task){
    var advertisers = task.advertisers.filter(function(ad){
        return ad.beeswax && ad.beeswax.advertiser &&
            ( !ad.beeswax.campaign && !ad.beeswax.creative);
    }).sort(function(a,b){
        return parseInt(a.beeswax.advertiser_id,10) > parseInt(b.beeswax.advertiser_id,10) ? 1 : -1;
    });
    console.log('Total Advertisers: ', task.advertisers.length,
        ', Empty: ', advertisers.length);

    function updateReelcontent(adv) {
        var opts = {
                url: task.rqsUrl + 'api/account/advertisers/' + adv.id,
                rejectUnauthorized : false,
                jar : true,
                json : {
                    beeswaxIds : null,
                    externalIds : null
                }
            }, deferred = q.defer();
      
        console.log('   Reelcontent');
        request.put(opts, function(error, response, body) {
            if (error) {
                return deferred.reject(error);
            }
            else if (response.statusCode !== 200) {
                return deferred.reject(body);
            }
            task.advertisers = body;  
            return deferred.resolve(adv);
        });
        
        return deferred.promise;
    }

    function updateBeeswax(adv){
        console.log('   Beeswax');
        return task.beeswax.advertisers.delete(adv.beeswax.advertiser_id);
    }

    function cleanAdvertiser(){
        var adv = advertisers.shift();
        if (!adv) {
            return task;
        }
        var advertiserId = adv.beeswax.advertiser_id;
        console.log('Remove beeswax data for ', adv.name, ' [', advertiserId, '] [',
                adv.id, ']');

//        return cleanAdvertiser();
        return updateReelcontent(adv)
            .then(updateBeeswax)
            .then(cleanAdvertiser);
    }

    return cleanAdvertiser();
}

q(initTask(task))
.then(authenticate)
.then(getAdvertisers)
.then(getBeeswaxStuff)
.then(cleanseAdvertiser)
.then(function(){
    console.log('Done');
})
.catch(function(e){
    console.log(e.stack);
});

