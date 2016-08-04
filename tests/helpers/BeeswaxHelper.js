'use strict';

const BeeswaxClient = require('beeswax-client');
const ld = require('lodash');
const uuid = require('rc-uuid');
const moment = require('moment');

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

    cleanupCampaign(campaignId) {
        let lineItems = [];
        let mappings  = [];

        // 1. Get Campaign Line Items
        return this.api.lineItems.query({ campaign_id : campaignId })

        //2. Get the LineItem Creative mappings
        .then((results) => {
            lineItems = results.payload;

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

        // 5. Delete Line Items
        .then(()=> Promise.all(lineItems.map((item) =>
                this.api.lineItems.delete(item.line_item_id))))

        // 6. Set campaigns to inactive
        .then(()=> this.api.campaigns.edit(campaignId,{ active : false }))
            
        // 7. Delete campaigns
        .then(()=> this.api.campaigns.delete(campaignId));
    }

    cleanupAdvertiser(advertiserId) {
        if (advertiserId === undefined){
            throw new Error('Must provide an advertiser id!');
        }
        let lineItems = [];
        let campaigns = [];
        let creatives = [];
        let mappings  = [];

        // 1. Get Advertisers Line Items, Campaigns and Creatives
        return Promise.all([
            this.api.advertisers.find( advertiserId ),
            this.api.lineItems.query({ advertiser_id : advertiserId }),
            this.api.campaigns.query({ advertiser_id : advertiserId }),
            this.api.creatives.query({ advertiser_id : advertiserId })
        ])
        
        //2. Get the LineItem Creative mappings
        .then((results) => {
            let advertiser = results[0].payload;
            if (!advertiser) {
                throw new Error('Unable to locate advertiser: ' + advertiserId);
            }

            lineItems = results[1].payload;
            campaigns = results[2].payload;
            creatives = results[3].payload;

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
        const regex = /(^E2E Test Advertiser |^e2e-advertiser--|^\d+ - placements.e2e)/;

        return this.api.advertisers.queryAll({}).then((resp) => {
            var toDelete = (resp.payload || []).filter(function(advert) {
                return regex.test(advert.advertiser_name);
            });
            return Promise.all(toDelete.map((item) => 
                this.cleanupAdvertiser(item.advertiser_id)));
        });
    }

    createMRAIDCreative(opts) {
        return this.api.uploadCreativeAsset({
            sourceUrl: 'https://reelcontent.com/images/logo-nav.png',
            advertiser_id: opts.advertiser_id
        })
        .then(asset => (
            this.api.creatives.create({
                advertiser_id: opts.advertiser_id,
                creative_type: 0,
                creative_template_id: 13,
                width: 300,
                height: 250,
                sizeless: true,
                secure: true,
                creative_name: `E2E Test Creative (${uuid.createUuid()})`,
                creative_attributes: {
                    mobile: { mraid_playable: [true] },
                    technical: {
                        banner_mime: ['text/javascript', 'application/javascript'],
                        tag_type: [3]
                    },
                    advertiser: {
                        advertiser_app_bundle: ['com.rc.test-app'],
                        advertiser_domain: ['https://apps.reelcontent.com'],
                        landing_page_url: ['https://apps.reelcontent.com/site/'],
                        advertiser_category: ['IAB24']
                    },
                    video: { video_api: [3] }
                },
                creative_content: {
                    TAG: `
                        <script>
                            document.write([
                                '<a href="{{CLICK_URL}}" target="_blank">',
                                '    <img src="https://reelcontent.com/images/logo-nav.png" width="300" height="250" />,
                                '</a>'
                            ].join('\\n'));
                        </script>
                    `
                },
                creative_thumbnail_url: asset.path_to_asset,
                active: true
            })
            .then(response => response.payload)
        ));
    }

    createAdvertiser() {
        let opts = ld.assign({
            advertiser_name : `E2E Test Advertiser (${uuid.createUuid()})`,
            active: true
        }, arguments[0]);
        return this.api.advertisers.create(opts).then(result => result.payload);
    }

    createCampaign() {
        let opts = ld.assign({
            campaign_name   : `E2E Test Campaign (${uuid.createUuid()})`,
            campaign_budget : 1000,
            budget_type     : 1,
            start_date      : moment().format('YYYY-MM-DD 00:00:00'),
            active: true
        }, arguments[0]);
        return this.api.campaigns.create(opts).then(result => result.payload);
    }

    createLineItem(opts) {
        const targeting = {
            targeting : {
                inventory: [ {
                    include: {
                        inventory_source: [3,0], interstitial: [true], environment_type: [1]
                    }
                } ],
                geo: [ { include: { country: [ 'USA' ] } } ],
                platform: [ { include: { os: [ 'iOS' ], device_model: [ 'iPhone' ] } } ],
                segment: [ { include: { user_id: [ true ] } } ]
            }
        };
        return this.api.targetingTemplates.create(ld.assign({}, targeting, {
            template_name: `E2E Test Template (${uuid.createUuid()})`,
            strategy_id: 1,
            active: true
        })).then(response => {
            const targetingTemplate = response.payload;
            return this.api.lineItems.create(ld.assign({
                line_item_type_id: 0,
                targeting_template_id: targetingTemplate.targeting_template_id,
                line_item_name: `E2E Test Line Item (${uuid.createUuid()})`,
                line_item_budget: 1000,
                budget_type: 1,
                bidding: {
                    bidding_strategy: 'CPM_PACED',
                    values: {
                        cpm_bid: 1
                    }
                },
                start_date: moment().format('YYYY-MM-DD 00:00:00'),
                end_date: moment().add(1, 'week').format('YYYY-MM-DD 23:59:59'),
                active: false
            },opts));
        })
        .then(response => {
            const lineItem = response.payload;
            return this.api.creatives.query({
                advertiser_id : opts.advertiser_id, creative_type: 0, creative_template_id: 13
            })
            .then(response => {
                const creative = response.payload[0];
                if (!creative) {
                    return lineItem;
                }
                return this.api.creativeLineItems.create({
                    creative_id: creative.creative_id,
                    line_item_id: lineItem.line_item_id,
                    active: true
                })
                .then(() => 
                    this.api.lineItems.edit(lineItem.line_item_id, { active: true })
                    .then(response => response.payload)
                );
            });
        });
    }
}

module.exports  = BeeswaxHelper;
