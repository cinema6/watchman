'use strict';

var BeeswaxClient   = require('beeswax-client'),
    CwrxRequest     = require('./CwrxRequest'),
    logger          = require('cwrx/lib/logger'),
    url             = require('url'),
    ld              = require('lodash'),
    querystring     = require('querystring'),
    q               = require('q'),
    path            = require('path'),
    fs              = require('fs');

function BeeswaxMiddleware(beeswaxConfig, cwrxConfig) {
    this.log         = logger.getLog();
    this.beeswaxApi  = new BeeswaxClient(beeswaxConfig);
    this.cwrxRequest = new CwrxRequest(cwrxConfig.creds);

    this.advertisersEndpoint = url.resolve(
        cwrxConfig.api.root, cwrxConfig.api.advertisers.endpoint);
    this.campaignsEndpoint = url.resolve(
        cwrxConfig.api.root, cwrxConfig.api.campaigns.endpoint);
    this.placementsEndpoint = url.resolve(cwrxConfig.api.root,
        cwrxConfig.api.placements.endpoint);
    this.trackingEndpoint = cwrxConfig.api.tracking;
}

/**
 * Helper to take an array of App Categories, IE that can be found
 * on the campaign product, and converts to IAB category codes used
 * by beeswax.
 */
BeeswaxMiddleware.prototype.appStoreToIABCats = function(asCats){
    return (asCats || []).map(function(cat){
        if (cat === 'Books')			 { return 'IAB1_1'; }   // (Books & Literature)
        if (cat === 'Business')			 { return 'IAB3_4'; }   // (Business Software)
        if (cat === 'Catalogs')			 { return 'IAB22'; }    // (Shopping)
        if (cat === 'Education')	     { return 'IAB5'; }     // (Education)
        if (cat === 'Entertainment')     { return 'IAB1'; }     // (Arts &Entertainment)
        if (cat === 'Finance')			 { return 'IAB13'; }    // (Personal Finance)
        if (cat === 'Food & Drink')	     { return 'IAB8'; }     // (Food & Drink)
        if (cat === 'Games')			 { return 'IAB9_30'; }  // (Video & Comp. Games)
        if (cat === 'Health & Fitness')  { return 'IAB7'; }     // (Health & Fitness)
        if (cat === 'Lifestyle')	     { return 'IAB9'; }     // (Hobbies  & Interests)
        if (cat === 'Medical')			 { return 'IAB7'; }     // (Health & Medicine)
        if (cat === 'Music')			 { return 'IAB1_6'; }   // (Music)
        if (cat === 'Navigation')	     { return 'IAB19'; }    // (Tech & Computing)
        if (cat === 'News')			     { return 'IAB12'; }    // (News)
        if (cat === 'Photo & Video')     { return 'IAB9_23'; }  // (Photography)
        if (cat === 'Productivity')		 { return 'IAB3_4'; }   // (Business Software)
        if (cat === 'Reference')		 { return 'IAB5'; }     // (Education)
        if (cat === 'Social Networking') { return 'IAB24'; }    // (Uncategorized)
        if (cat === 'Sports')			 { return 'IAB17'; }    // (Sports)
        if (cat === 'Travel')			 { return 'IAB20'; }    // (Travel)
        if (cat === 'Utilities')		 { return 'IAB19'; }    // (Tech & Computing)
        if (cat === 'Weather')			 { return 'IAB15_10'; } // (Science-Weather)
        return 'IAB24';     // (Uncategorized)
    });
};

/**
 * Formats the Tracking Pixel URL attached to creatives.
 */
BeeswaxMiddleware.prototype.formatPixelUrl = function(placement) {
    var pixelUrl = this.trackingEndpoint + '?';

    pixelUrl += querystring.stringify(ld.pickBy({
        placement       : placement.id,
        campaign        : placement.tagParams.campaign,
        card            : placement.tagParams.card,
        container       : placement.tagParams.container,
        event           : 'impression'
    }));

    [
        { field: 'hostApp'  , qp: 'hostApp' },
        { field: 'network'  , qp: 'network' },
        { field: 'uuid'     , qp: 'extSessionId' },
        { field: 'ex'       , qp: 'ex' },
        { field: 'vr'       , qp: 'vr' },
        { field: 'branding' , qp: 'branding' },
        { field: 'domain'   , qp: 'domain' },
    ].forEach(function(obj) {
        var val;
        if (placement.tagParams[obj.field]) {
            // Do not url-encode the field if it's a beeswax macro
            if (/{{.+}}/.test(placement.tagParams[obj.field])) {
                val = placement.tagParams[obj.field];
            } else {
                val = encodeURIComponent(placement.tagParams[obj.field]);
            }
            pixelUrl += '&' + obj.qp + '=' + val;
        }
    });
    pixelUrl += '&cb={{CACHEBUSTER}}';
    
    return pixelUrl;
};
  
/** 
 * Creates a Beeswax Advertiser if the c6 Advertiser doesn't already
 * have one.  It will also update the c6 Advertiser with the externalId
 * of its Beeswax counterpart.  If the Beeswax Advertiser was already created
 * by legacy code in the c6 services, it will update the c6 Advertiser to use
 * the current format. The req parameter is mutated, and returned as the result.
 */

BeeswaxMiddleware.prototype.createAdvertiser = function(req){
    var self = this, log = self.log;

    return self.cwrxRequest.get({
        url : self.advertisersEndpoint + '/' + req.advertiser.id 
    }).spread(function(advertiser){
        if (ld.get(advertiser, 'externalIds.beeswax', undefined) !== undefined){
            log.trace('Advertiser (%1) has BeeswaxId (%2)',
                advertiser.id,advertiser.externalIds.beeswax);
            req.advertiser = advertiser;
            return req;
        }

        return (function() {
            // The advertiser record has a Beeswax Id in the wrong place
            if (ld.get(advertiser, 'beeswaxIds.advertiser', undefined) !== undefined){
                return q([advertiser, advertiser.beeswaxIds.advertiser]);
            }

            log.info('Creating beeswax Advertiser for advertiser (%1).', advertiser.id);
            // The advertiser record does not have a Beeswax Equivalent, lets create one.
            return self.beeswaxApi.advertisers.create({
                advertiser_name : advertiser.name,
                alternative_id  : advertiser.id,
                notes : 'Created by Watchman!',
                active : true
            }).then(function(result){
                return [advertiser, result.payload.advertiser_id ];
            });

        }()).spread(function (advertiser, beeswaxId){
            // The advertiser record needs to be updated with the 
            // correct externalIds property
            log.trace('Updating Advertiser %1 with exteranIds.beeswax=%2',
                advertiser.id, beeswaxId);
            return self.cwrxRequest.put({
                url : self.advertisersEndpoint + '/' + advertiser.id,
                json : {
                    externalIds : {
                        beeswax : beeswaxId
                    }
                }
            });
        }).spread(function(advertiser){
            req.advertiser = advertiser;
            return req;
        });
    });
};

/**
 * Creates a Beeswax campaign that will represent the c6 campaign.
 * The campaign is created inactive, and will need to be updated with
 * budget (impressions). The method will update the c6 campaign with the
 * externalId of the beeswax counterpart.  The method returns the mutated
 * request object parameter with the updated campaign property.
 */
BeeswaxMiddleware.prototype.createCampaign = function(req) {
    var self = this, log = self.log;
    
    log.info('Initialize beeswax campaign for campaign (%1)',req.campaign.id);
    return self.beeswaxApi.campaigns.create({
        advertiser_id   : req.advertiser.externalIds.beeswax,
        alternative_id  : req.campaign.id,
        campaign_name   : req.campaign.name,
        budget_type     : 1,
        campaign_budget : 1,
        start_date      : (new Date()).toISOString().substr(0,10) + ' 00:00:00',
        active          : false
    }).then(function(result){
        log.trace('Updating Campaign %1 with exteranIds.beeswax=%2',
            req.campaign.id, result.payload.campaign_id);
        return self.cwrxRequest.put({
            url : self.campaignsEndpoint + '/' + req.campaign.id,
            json : {
                externalIds : {
                    beeswax : result.payload.campaign_id
                }
            }
        });
    }).spread(function(campaign){
        req.campaign = campaign;
        return req;
    });
};

/**
 * Creates Beeswax creatives for each beeswax MRAID placement found
 * in req.placements.  After the creatives are created, the placments
 * are updated in the c6 api with the externalIds.  The req object is
 * mutated with the updated placements and returned as the result.
 */
BeeswaxMiddleware.prototype.createCreatives = function(req) {
    var self = this, log = self.log;

    log.trace('Will create creatives for %1 placements.',req.placements.length);

    return q.all(req.placements.map(function(placement){
        if (placement.tagType !== 'mraid'){
            log.warn('Placement %1 has tagType=%2, skip',
                placement.id, placement.tagType);
            return placement;
        }

        if (placement.tagParams.container !== 'beeswax'){
            log.warn('Placement %1 has container=%2, skip',
                placement.id, placement.tagParams.container);
            return placement;
        }
        
        var adUri = url.parse(req.campaign.product.uri);
        var creative = {
            active               : true,
            advertiser_id        : req.advertiser.externalIds.beeswax,
            alternative_id       : placement.id,
            creative_type        : 0,
            creative_template_id : 13,
            width                : 320,
            height               : 480,
            sizeless             : true,
            secure               : true,
            creative_name        : 'MRAID Inter: ' + req.campaign.product.name,
            creative_content     : {
                ADDITIONAL_PIXELS: [{
                    PIXEL_URL: self.formatPixelUrl(placement)
                }]
            },
            creative_attributes : {
                mobile    : { mraid_playable : [ true ] },
                technical : { 
                    banner_mime : [ 'text/javascript', 'application/javascript' ], 
                    tag_type    : [ 3 ]
                },
                advertiser : {
                    advertiser_domain : [adUri.protocol + '//' + adUri.hostname ],
                    landing_page_url: [adUri.protocol + '//' + adUri.host + adUri.pathname],
                    advertiser_category : 
                        self.appStoreToIABCats(req.campaign.product.categories)
                },
                video : { video_api: [ 3 ] }
            }
        };
        var templatePath = path.join(__dirname,
                '../templates/beeswax/tags/mraid.html'),
            tagHtml = fs.readFileSync(templatePath, 'utf8'),
            opts = { placement: placement.id },
            thumbnailUrl;
        
        Object.keys(placement.showInTag || {}).forEach(function(key) {
            if (    placement.showInTag[key] === true && 
                    !!placement.tagParams[key]) {
                opts[key] = placement.tagParams[key];
            }
        });

        creative.creative_content.TAG 
            = tagHtml.replace('%OPTIONS%', JSON.stringify(opts));
                    
        return self.beeswaxApi.uploadCreativeAsset({
            sourceUrl     : placement.thumbnail,
            advertiser_id : req.advertiser.externalIds.beeswax
        }).then(function(asset){
            creative.creative_thumbnail_url = asset.path_to_asset;
            return self.beeswaxApi.creatives.create(creative);
        }).then(function (result){
            return self.cwrxRequest.put({
                url: self.placementsEndpoint + '/' + placement.id,
                json: {
                    externalIds : { beeswax : result.payload.creative_id }
                }
            });
        });
    })).then(function(results){
        req.placements = ld.flatten(results);
        return req;
    });
};

/**
 * Receives a req object with an optional advertiser property, and required
 * campaign and placements properties.  If any of the placements are for
 * beeswax MRAID, the BW advertiser, campaign, and creatives will be generated.
 * The request object is mutated and returned as the result.
 */

BeeswaxMiddleware.prototype.initShowcaseAppsCampaign = function(initData){
    var self = this;

    function init(req){
        if (!req.advertiser) {
            req.advertiser =  { id : req.campaign.advertiserId };
        }

        var beeswaxPlacements = req.placements.filter(function(placement){
            return (placement.tagType === 'mraid' &&
                placement.tagParams.container === 'beeswax');
        });

        if (beeswaxPlacements.length === 0){
            throw new Error('Cannot initShowcaseAppsCampaign without beeswax placement.');
        }
        return req;
    }

    return q(initData)
        .then(function(req){
            return init(req);
        }).then(function(req){
            return self.createAdvertiser( req );
        }).then(function(req){
            return self.createCampaign( req )
        }).then(function(req){
            return self.createCreatives( req )
        });
};


module.exports = BeeswaxMiddleware;