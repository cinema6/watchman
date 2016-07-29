'use strict';

const BeeswaxClient = require('beeswax-client');
const ld = require('lodash');

class BeeswaxHelper {
    constructor(options) {
        let opts = {};
        
        opts.apiRoot = 'https://stingersbx.api.beeswax.com';
        opts.creds = ld.assign(ld.get(options,'creds'), {
            email: 'ops@cinema6.com',
            password: '07743763902206f2b511bead2d2bf12292e2af82'
        });

        this.api = new BeeswaxClient(opts);
    }

    cleanupAdvertiser(advertiserId) {
        let lineItems = [];
        let campaigns = [];
        let creatives = [];
        let mappings  = [];

        // 1. Get Advertisers Line Items, Campaigns and Creatives
        return Promise.all([
            this.api.lineItems.query({ advertiser_id : advertiserId }),
            this.api.campaigns.query({ advertiser_id : advertiserId }),
            this.api.creatives.query({ advertiser_id : advertiserId })
        ])
        
        //2. Get the LineItem Creative mappings
        .then((results) => {
            lineItems = results[0].payload;
            campaigns = results[1].payload;
            creatives = results[2].payload;

            return Promise.all(
                lineItems.map((item) => 
                    this.api.creativeLineItems.query({line_item_id : item.line_item_id })
                        .then((result) => result.payload) ) );
        })
        
        // 3. Set all the line items to inactive.
        .then((results) => {
            mappings = ld.flattenDeep(results);

            return Promise.all(
                lineItems.map((item) => this.api.lineItems.edit(item.line_item_id,
                    { active : false } )) );
        })
        
        // 4. Remove line item / creative mappings
        .then(()=> Promise.all(mappings.map((item) =>
                this.api.creativeLineItems.delete(item.cli_id))))

        // 5. Set creatives to inactive
        .then(()=> Promise.all(creatives.map((item) =>
                this.api.creatives.edit(item.creative_id,{ active : false }))))
            
        // 6. Delete creatives
        .then(()=> Promise.all(creatives.map((item) =>
                this.api.creatives.delete(item.creative_id))))

        // 7. Delete Line Items
        .then(()=> Promise.all(lineItems.map((item) =>
                this.api.lineItems.delete(item.line_item_id))))

        // 8. Set campaigns to inactive
        .then(()=> Promise.all(campaigns.map((item) =>
                this.api.campaigns.edit(item.campaign_id,{ active : false }))))
            
        // 9. Delete campaigns
        .then(()=> Promise.all(campaigns.map((item) =>
                this.api.campaigns.delete(item.campaign_id))))

        // 10. Delete the advertiser
        .then(() => this.api.advertisers.delete(advertiserId));
    }

    cleanupAllTestAdvertisers() {
        const regex = /(^e2e-advertiser--|^\d+ - placements.e2e)/;

        return this.api.advertisers.queryAll({}).then((resp) => {
            var toDelete = (resp.payload || []).filter(function(advert) {
                return regex.test(advert.advertiser_name);
            });
            return Promise.all(toDelete.map((item) => 
                this.cleanupAdvertiser(item.advertiser_id)));
        });
    }

};

module.exports  = BeeswaxHelper;
