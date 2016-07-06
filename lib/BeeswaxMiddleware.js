'use strict';

var BeeswaxClient   = require('beeswax-client'),
    CwrxRequest     = require('./CwrxRequest'),
    logger          = require('cwrx/lib/logger'),
    url             = require('url'),
    ld              = require('lodash'),
    q               = require('q');
//    path            = require('path'),
//    fs              = require('fs');

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
}

BeeswaxMiddleware.prototype.createAdvertiser = function(req){
    var self = this, log = self.log;

    return self.cwrxRequest.get({
        url : self.advertisersEndpoint + '/' + req.id 
    }).spread(function(advertiser){
        if (ld.get(advertiser, 'externalIds.beeswax', undefined) !== undefined){
            log.trace('Advertiser (%1) has BeeswaxId (%2)',
                advertiser.id,advertiser.externalIds.beeswax);
            return advertiser;
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
            return advertiser;
        });
    });
};

BeeswaxMiddleware.prototype.createCampaign = function(req) {
    var self = this, log = self.log;
    
    log.info('Initialize beeswax campaign for campaign (%1)',req.campaign.id);
    return self.beeswaxApi.campaigns.create({
        advertiser_id   : req.advertiser.externalIds.beeswax,
        alternative_id  : req.campaign.id,
        campaign_name   : req.campaign.name,
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
        return campaign;
    });
};

BeeswaxMiddleware.prototype.createCreatives = function(req) {
    var self = this, log = self.log;

    log.trace('Will create creatives for %1 placements.',req.placements.length);

    return q.all(req.placements.map(function(placement){
        var creative = {};
        return q({});
        //return self.beeswaxApi.uploadCreativeAsset({
        //    sourceUrl     : placement.thumbnail,
        //    advertiser_id : req.advertiser.externalIds.beeswax
        //}).then(function(asset){
        //    creative.creative_thumbnail_url = asset.path_to_asset;
        //    return self.beeswaxApi.creatives.create(creative);
        //}).then(function (result){
        //    return self.cwrxRequest.put({
        //        url: self.placementsEndpoint + '/' + placement.id,
        //        json: {
        //            externalIds : { beeswax : result.payload.creative_id }
        //        }
        //    });
        //});
    }));
};

BeeswaxMiddleware.prototype.initShowcaseAppsCampaign = function(req){
    var self = this;
    return self.createAdvertiser( { id : req.campaign.advertiserId })
        .then(function(result){
            req.advertiser = result;
            return self.createCampaign( req )
        });
};


module.exports = BeeswaxMiddleware;
