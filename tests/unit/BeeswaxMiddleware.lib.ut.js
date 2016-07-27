'use strict';

const proxyquire = require('proxyquire').noCallThru();
const logger = require('cwrx/lib/logger');

fdescribe('BeeswaxMiddleware(config)', function() {

    describe('instance:', function() {
        var url, q, ld, log;
        var BeeswaxClient, BeeswaxMiddleware, CwrxRequest;
        var middleWare, request, beeswax, advertiser, campaign, placements, transaction;
        var bwCreateAdvertiserDeferred, bwCreateCampaignDeferred, bwFindCampaignDeferred,
            bwCreateCreativeDeferred, bwQueryCreativeDeferred, bwUploadAssetDeferred,
            bwQueryLineItemDeferred, bwCreateLineItemDeferred, bwEditLineItemDeferred,
            bwCreateTargetingTemplDeferred, bwCreateLineItemCreativeDeferred;
        var putAdvertiserDeferred, getAdvertiserDeferred,
            putCampaignDeferred, putPlacementDeferred;
        var updatedAdvert, updatedCampaign, updatedPlacement, result;
        var sortPlacements;

        beforeAll(function(){
            jasmine.clock().install();
            //Wed Jan 27 2016 16:22:47 GMT-0500 (EST)
            jasmine.clock().mockDate(new Date(1453929767464));

            q  = require('q');
            ld = require('lodash');
            url = require('url');

            CwrxRequest = jasmine.createSpy('CwrxRequest()').and.callFake(function() {
                return {
                    send : jasmine.createSpy('send()').and.returnValue(q.defer().promise),
                    post : function() { return null; },
                    put : function() { return null; },
                    get : function() { return null; }
                };
            });
           
            BeeswaxClient = jasmine.createSpy('BeeswaxClient()').and.callFake(function(){
                return {
                    advertisers : { create : function() { return null; }},
                    campaigns : { 
                        create : function() { return null; },
                        find : function() { return null; }
                    },
                    creatives : { 
                        create : function() { return null; },
                        query  : function() { return null; } 
                    },
                    lineItems : { 
                        create : function() { return null; },
                        edit   : function() { return null; },
                        query  : function() { return null; } 
                    },
                    targetingTemplates : { 
                        create : function() { return null; }
                    },
                    creativeLineItems : {
                        create : function() { return null; }
                    },
                    uploadCreativeAsset : function(){ return null; }
                };
            });

            BeeswaxMiddleware = proxyquire('../../lib/BeeswaxMiddleware',{
                'beeswax-client' : BeeswaxClient,
                './CwrxRequest' : CwrxRequest
            });
        });
        
        afterAll(function() {
            jasmine.clock().uninstall();
        });

        beforeEach(function() {
            sortPlacements = function(a,b){ return a.id > b.id; };

            advertiser = {
                id      : 'a-1234567',
                name    : 'ACME TNT'
            };

            campaign = {
                id              : 'c-1234567',
                name            : 'Revengus Extremis',
                advertiserId    : 'a-1234567',
                product         : {
                    uri     : 'https://itunes.apple.com/us/app/revex/id1093924230?mt=8&uo=4',
                    name    : 'Revengus Extremis',
                    type    : 'app',
                    platform: 'iOS',
                    categories : [ 'Music', 'Business' ],
                    websites   : [ 'https://1', 'https://2' ]
                }
            };

            placements = [
                {
                    id      : 'p-1111111',
                    tagType : 'mraid',
                    tagParams : {
                        container   : 'beeswax',
                        type        : 'mobile-card',
                        mobileType  : 'mobile-card',
                        hostApp     : '{{APP_BUNDLE}}',
                        network     : '{{INVENTORY_SOURCE}}',
                        clickUrls   : [ '{{CLICK_URL}}' ],
                        card        : 'rc-1111111',
                        campaign    : 'c-1234567'
                    },
                    showInTag : {
                        hostApp     : true,
                        network     : true,
                        uuid        : true,
                        clickUrls   : true
                    },
                    thumbnail: 'http://is3.mzstatic.com/image/thumb/1.jpg'
                },
                {
                    id      : 'p-2222222',
                    tagType : 'mraid',
                    tagParams : {
                        container   : 'beeswax',
                        type        : 'mobile-card',
                        mobileType  : 'mobile-card',
                        hostApp     : '{{APP_BUNDLE}}',
                        network     : '{{INVENTORY_SOURCE}}',
                        clickUrls   : [ '{{CLICK_URL}}' ],
                        card        : 'rc-2222222',
                        campaign    : 'c-1234567'
                    },
                    showInTag : {
                        hostApp     : true,
                        network     : true,
                        uuid        : true,
                        clickUrls   : true
                    },
                    thumbnail: 'http://is3.mzstatic.com/image/thumb/2.jpg'
                }
            ];

            transaction = {
                application: 'showcase',
                transactionId: 't-0aZ1z90bw5Snihpq',
                transactionTimestamp: '2016-07-21T15:00:44.962Z',
                orgId: 'o-0iY5h40ajlO1U03K',
                amount: '49.9900',
                braintreeId: 'msac53hk',
                promotionId: null,
                paymentPlanId: 'pp-0Ekdsm05KVZ43Aqj',
                cycleStart: '2016-07-21T00:00:00.000Z',
                cycleEnd: '2016-08-20T23:59:59.000Z',
                planViews: 2000,
                bonusViews: 0,
                totalViews: 2000
            };

            spyOn(logger, 'getLog').and.returnValue(log = jasmine.createSpyObj('log', [
                'info',
                'trace',
                'warn',
                'error'
            ]));

            middleWare  = new BeeswaxMiddleware(
                {
                    api: { root: 'http://33.33.33.10/' },
                    creds: { email : 'bu@g.z', password : 'x' },
                    templates : {
                        targeting : {
                            mobile_app: [ {
                                exclude: { app_bundle_list: [ 1533, 1547, 1548, 2977 ] }
                            }]
                        }
                    }
                },
                {
                    api: {
                        root: 'http://33.33.33.10/',
                        tracking: 'http://audit.rc.com/pixel.gif',
                        placements:  { endpoint: '/api/placements' },
                        campaigns:   { endpoint: '/api/campaigns' },
                        advertisers: { endpoint: '/api/account/advertisers' }
                    },
                    creds : { key: 'watchman-dev', secret: 'dwei9fhj3489ghr7834909r' }
                },
                { 
                    conversionMultipliers : {
                        external : 2
                    }
                }
            );

            request  = CwrxRequest.calls.mostRecent().returnValue;
            beeswax  = BeeswaxClient.calls.mostRecent().returnValue;
        });

        beforeEach(function(){
            bwCreateAdvertiserDeferred  = q.defer();
            bwCreateCampaignDeferred    = q.defer();
            bwFindCampaignDeferred      = q.defer();
            bwQueryLineItemDeferred     = q.defer();
            bwCreateLineItemDeferred    = q.defer();
            bwEditLineItemDeferred      = q.defer();
            bwCreateTargetingTemplDeferred = q.defer();
            bwCreateLineItemCreativeDeferred = q.defer();
            bwQueryCreativeDeferred     = q.defer();
            bwCreateCreativeDeferred    = [ q.defer(), q.defer() ];
            bwUploadAssetDeferred       = [ q.defer(), q.defer() ];
            getAdvertiserDeferred       = q.defer();
            putAdvertiserDeferred       = q.defer();
            putCampaignDeferred         = q.defer();
            putPlacementDeferred        = [ q.defer(), q.defer() ];
            updatedAdvert               = {};
            updatedCampaign             = {};
            updatedPlacement            = [{},{}];
            result                      = null;
            
            spyOn(beeswax.advertisers,'create')
                .and.returnValue(bwCreateAdvertiserDeferred.promise);

            spyOn(beeswax.campaigns,'create')
                .and.returnValue(bwCreateCampaignDeferred.promise);
            
            spyOn(beeswax.campaigns,'find').and.callFake(function(){
                return bwFindCampaignDeferred.promise;
            });
            
            spyOn(beeswax,'uploadCreativeAsset').and.callFake(function(opts){
                var def = bwUploadAssetDeferred[ ld.findIndex( placements,
                    function(v) { return v.thumbnail === opts.sourceUrl; }) ];

                return def !== undefined ? def.promise : q.reject( 
                    new Error('Unexpected creative url: ' + opts.sourceUrl));
            });

            spyOn(beeswax.lineItems,'create').and.callFake(function(){
                return bwCreateLineItemDeferred.promise;
            });
            
            spyOn(beeswax.lineItems,'edit').and.callFake(function(){
                return bwEditLineItemDeferred.promise;
            });
            
            spyOn(beeswax.lineItems,'query').and.callFake(function(){
                return bwQueryLineItemDeferred.promise;
            });
            
            spyOn(beeswax.targetingTemplates,'create').and.callFake(function(){
                return bwCreateTargetingTemplDeferred.promise;
            });
            
            spyOn(beeswax.creativeLineItems,'create').and.callFake(function(){
                return bwCreateLineItemCreative.promise;
            });
            
            spyOn(beeswax.creatives,'query').and.callFake(function(){
                return bwQueryCreativeDeferred.promise;
            });
            
            spyOn(beeswax.creatives,'create').and.callFake(function(opts){
                var def = bwCreateCreativeDeferred[ld.findIndex( placements,
                    function(v) { return v.id === opts.alternative_id; })];

                return def !== undefined ? def.promise : q.reject( 
                    new Error('Unexpected placment id: ' + opts.alternative_id));
            });

            spyOn(request, 'get')
                .and.callFake(function(opts){
                    if(opts.url.match(/\/api\/account\/advertisers/)){
                        return getAdvertiserDeferred.promise;
                    }
                    return q.reject('Unexpected GET');
                });
            
            spyOn(request, 'put').and.callFake(function(opts){
                var id, index;
                if(opts.url.match(/\/api\/placements/)){
                    id = url.parse(opts.url).pathname.split('/')[3];
                    index = ld.findIndex(placements,
                        function(v) { return v.id === id; });
                    ld.assign(updatedPlacement[index],placements[index],opts.json);
                    return putPlacementDeferred[index].promise;
                }
                
                if(opts.url.match(/\/api\/account\/advertisers/)){
                    ld.assign(updatedAdvert,advertiser,opts.json);
                    return putAdvertiserDeferred.promise;
                }
                
                if(opts.url.match(/\/api\/campaigns/)){
                    ld.assign(updatedCampaign,campaign,opts.json);
                    return putCampaignDeferred.promise;
                }

                return q.reject('Unexpected PUT');
            });
            
        });

        it('is properly initialized',function(){
            expect(middleWare).toBeDefined();
            expect(middleWare.beeswaxApi).toEqual(beeswax);
            expect(middleWare.cwrxRequest).toEqual(request);
            expect(middleWare.advertisersEndpoint).toEqual(
                'http://33.33.33.10/api/account/advertisers');
            expect(middleWare.campaignsEndpoint).toEqual(
                'http://33.33.33.10/api/campaigns');
            expect(middleWare.placementsEndpoint).toEqual(
                'http://33.33.33.10/api/placements');
            expect(middleWare.defaultTargetingTempl).toEqual({
                inventory: [ {
                    include: {
                        inventory_source: [ 3, 0 ], interstitial: [ true ], 
                            environment_type: [ 1 ]
                    }
                } ],
                geo: [ { include: { country: [ 'USA' ] } } ],
                platform: [ { include: { os: [ 'iOS' ], device_model: [ 'iPhone' ] } } ],
                segment: [ { include: { user_id: [ true ] } } ],
                mobile_app: [ {
                    exclude: { app_bundle_list: [ 1533, 1547, 1548, 2977 ] }
                }]
            });
            expect(middleWare.defaultMultiplier).toEqual(2);
        });

        describe('method: toBeeswaxDate', function(){
            it('converts date object',function(){
                expect(middleWare.toBeeswaxDate(new Date('2016-02-26T23:59:59.999Z')))
                    .toEqual('2016-02-26 18:59:59');
            });

            it('converts date string',function(){
                expect(middleWare.toBeeswaxDate('2016-02-27T03:59:59.999Z'))
                    .toEqual('2016-02-26 22:59:59');
            });
        });

        describe('method: createAdvertiser',function(){
            beforeEach(function(done){
                bwCreateAdvertiserDeferred.fulfill({ payload : {advertiser_id:1}});
                getAdvertiserDeferred.fulfill([advertiser]);
                putAdvertiserDeferred.fulfill([updatedAdvert]);
                process.nextTick(done);
            });
            
            describe('from c6 Advertiser with no beeswax ids',function(){
                beforeEach(function(done){
                    delete advertiser.externalIds;
                    middleWare.createAdvertiser( { advertiser : { id : 'a-1234567' } })
                    .then(function(res){ result = res; })
                    .then(done,done.fail);
                });

                it('will attempt to create a beeswax advertiser',function(){
                    expect(beeswax.advertisers.create).toHaveBeenCalledWith({
                        advertiser_name    : 'ACME TNT',
                        alternative_id     : 'a-1234567',
                        notes : 'Created by Watchman!',
                        active : true
                    });
                });

                it('will attempt to update the rc advertiser',function(){
                    expect(request.put).toHaveBeenCalledWith({
                        url : 'http://33.33.33.10/api/account/advertisers/' +
                            advertiser.id,
                        json : { externalIds : { beeswax : 1 } }
                    });
                });

                it('returns an updated advertiser',function(){
                    expect(result.advertiser.externalIds.beeswax).toEqual(1);
                });

            });
            
            describe('from c6 Advertiser with old beeswax id structure',function(){
                beforeEach(function(done){
                    delete advertiser.externalIds;
                    advertiser.beeswaxIds = { advertiser : 2 };
                    middleWare.createAdvertiser( { advertiser : { id : 'a-1234567' } })
                    .then(function(res){ result = res; })
                    .then(done,done.fail);
                });

                it('will not attempt to create a beeswax advertiser',function(){
                    expect(beeswax.advertisers.create).not.toHaveBeenCalled();
                });

                it('will attempt to update the rc advertiser',function(){
                    expect(request.put).toHaveBeenCalledWith({
                        url : 'http://33.33.33.10/api/account/advertisers/' +
                            advertiser.id,
                        json : { externalIds : { beeswax : 2 } }
                    });
                });
                
                it('returns an updated advertiser',function(){
                    expect(result.advertiser.externalIds.beeswax).toEqual(2);
                });
            });

            describe('from c6 Advertiser with current beeswax id structure',function(){
                beforeEach(function(done){
                    advertiser.externalIds = { beeswax : 3 };
                    middleWare.createAdvertiser( { advertiser : { id : 'a-1234567' } })
                    .then(function(res){ result = res; })
                    .then(done,done.fail);
                });

                it('will not attempt to create a beeswax advertiser',function(){
                    expect(beeswax.advertisers.create).not.toHaveBeenCalled();
                });

                it('will not attempt to update the rc advertiser',function(){
                    expect(request.put).not.toHaveBeenCalled();
                });

                it('returns the advertiser',function(){
                    expect(result.advertiser).toEqual(advertiser);
                });
            });

            describe('negative paths',function(){
                beforeEach(function(){
                    getAdvertiserDeferred       = q.defer();
                    request.get.and.returnValue( getAdvertiserDeferred.promise);
                    
                    bwCreateAdvertiserDeferred  = q.defer();
                    beeswax.advertisers.create
                        .and.returnValue(bwCreateAdvertiserDeferred.promise);
                });

                it('c6 advertiser lookup failure',function(done){
                    getAdvertiserDeferred.reject(new Error('Failed c6 advertiser lookup!'));
                    middleWare.createAdvertiser( { advertiser : { id : 'a-1234567' } })
                    .then(done.fail, function(e){
                        expect(e.message).toEqual('Failed c6 advertiser lookup!');    
                        expect(beeswax.advertisers.create).not.toHaveBeenCalled();
                        expect(request.put).not.toHaveBeenCalled();
                    })
                    .then(done,done.fail);
                });

                it('beeswax create failure',function(done){
                    delete advertiser.externalIds;
                    getAdvertiserDeferred.fulfill([advertiser]);
                    bwCreateAdvertiserDeferred.reject(new Error('Failed beeswax create!'));
                    middleWare.createAdvertiser( { advertiser : { id : 'a-1234567' } })
                    .then(done.fail, function(e){
                        expect(e.message).toEqual('Failed beeswax create!');    
                        expect(request.put).not.toHaveBeenCalled();
                    })
                    .then(done,done.fail);
                });
            });
        });

        describe('method: createCampaign',function(){
            beforeEach(function(done){
                advertiser.externalIds = { beeswax : 22};
                putCampaignDeferred.fulfill([updatedCampaign]);
                process.nextTick(done);
            });

            it('creates a beeswax campaign',function(done){
                bwCreateCampaignDeferred.fulfill({ payload : {campaign_id:11}});
                middleWare.createCampaign({ campaign: campaign, advertiser : advertiser})
                .then(function(res){ 
                    expect(beeswax.campaigns.create).toHaveBeenCalledWith({
                        advertiser_id : 22,
                        alternative_id : 'c-1234567',
                        campaign_name : 'Revengus Extremis',
                        start_date : '2016-01-27 00:00:00',
                        budget_type : 1,
                        campaign_budget : 1,
                        active : false
                    });
                    expect(request.put).toHaveBeenCalled();
                    expect(res.campaign.externalIds.beeswax).toEqual(11);
                })
                .then(done,done.fail);
            });

            it('handles a create failure',function(done){
                bwCreateCampaignDeferred.reject(new Error('Failed beeswax create!'));
                middleWare.createCampaign({ campaign: campaign, advertiser : advertiser})
                .then(done.fail,function(e){ 
                    expect(beeswax.campaigns.create).toHaveBeenCalled();
                    expect(request.put).not.toHaveBeenCalled();
                    expect(e.message).toEqual('Failed beeswax create!');
                })
                .then(done,done.fail);
            });
        });

        describe('method: createCreative',function(){
            beforeEach(function(){
                advertiser.externalIds = { beeswax : 33};
            });
            describe('postive path',function(){
                beforeEach(function(){
                    bwUploadAssetDeferred.forEach(function(def,idx){
                        def.fulfill({
                            path_to_asset : '/all/paths/lead/to/rome-' + (idx+1) + '.jpg'
                        });
                    });

                    bwCreateCreativeDeferred.forEach(function(def,idx){
                        def.fulfill( { payload : { creative_id : (idx+1) } } );
                    });
                    
                    putPlacementDeferred.forEach(function(def,idx){
                        def.fulfill( [ updatedPlacement[idx] ] );
                    });

                });

                describe('one placement not beeswax',function(){
                    beforeEach(function(done){
                        placements[0].tagParams.container = 'not-beeswax';
                        middleWare.createCreatives({
                            campaign   : campaign,
                            advertiser : advertiser,
                            placements : placements
                        }).then(function(res){
                            result = res;
                        }).then(done,done.fail);
                    });

                    it('uploads one thumbnail',function(){
                        expect(beeswax.uploadCreativeAsset.calls.count()).toEqual(1);
                        expect(beeswax.uploadCreativeAsset.calls.allArgs()).toEqual([
                            [{
                                advertiser_id : 33,
                                sourceUrl : 'http://is3.mzstatic.com/image/thumb/2.jpg'
                            }]
                        ]);
                    });

                    it('uploads a creative with the thumbnail',function(){
                        expect(beeswax.creatives.create.calls.count()).toEqual(1);
                        var req = beeswax.creatives.create.calls.argsFor(0)[0];
                        expect(req.advertiser_id).toEqual(33);
                        expect(req.creative_name).toEqual('MRAID Inter: Revengus Extremis');
                        expect(req.creative_content.ADDITIONAL_PIXELS[0].PIXEL_URL)
                            .toEqual(
                                'http://audit.rc.com/pixel.gif?placement=p-2222222' +
                                '&campaign=c-1234567&card=rc-2222222&container=beeswax&' +
                                'event=impression&hostApp={{APP_BUNDLE}}&' +
                                'network={{INVENTORY_SOURCE}}&cb={{CACHEBUSTER}}'
                            );
                        expect(req.creative_attributes.advertiser).toEqual({
                            advertiser_domain : [ 'https://1' ],
                            landing_page_url: [ 
                                'https://itunes.apple.com/us/app/revex/id1093924230'
                            ], 
                            advertiser_category: [ 'IAB1_6', 'IAB3_4' ]
                        });
                    });

                    it('updates the placement with the beeswax creative_id',function(){
                        expect(request.put.calls.allArgs()).toEqual([[{
                            url : 'http://33.33.33.10/api/placements/p-2222222',
                            json : {
                                externalIds : { beeswax : 2 }
                            }
                        }]]);
                    });

                    it('returns one updated placement, one as it was',function(){
                        var sorted = result.placements.sort(sortPlacements);
                        expect(sorted[0]).toEqual(
                            jasmine.objectContaining(
                                { id : 'p-1111111' }
                            )
                        );
                        expect(sorted[0].externalIds).not.toBeDefined();
                        expect(sorted[1]).toEqual(
                            jasmine.objectContaining(
                                { id : 'p-2222222', externalIds : { beeswax : 2 }}
                            )
                        );
                    });
                });

                describe('one beeswax placement not mraid, no product.websites',function(){
                    beforeEach(function(done){
                        delete campaign.product.websites;
                        placements[0].tagType = 'other';
                        middleWare.createCreatives({
                            campaign   : campaign,
                            advertiser : advertiser,
                            placements : placements
                        }).then(function(res){
                            result = res;
                        }).then(done,done.fail);
                    });

                    it('returns one updated placement, one as it was',function(){
                        var sorted = result.placements.sort(sortPlacements);
                        expect(beeswax.uploadCreativeAsset.calls.count()).toEqual(1);
                        expect(beeswax.creatives.create.calls.count()).toEqual(1);
                        expect(sorted[0]).toEqual(
                            jasmine.objectContaining(
                                { id : 'p-1111111' }
                            )
                        );
                        expect(sorted[0].externalIds).not.toBeDefined();
                        expect(sorted[1]).toEqual(
                            jasmine.objectContaining(
                                { id : 'p-2222222', externalIds : { beeswax : 2 }}
                            )
                        );
                        
                        var req = beeswax.creatives.create.calls.argsFor(0)[0];
                        expect(req.creative_attributes.advertiser).toEqual({
                            advertiser_domain : [ 'https://itunes.apple.com' ],
                            landing_page_url: [ 
                                'https://itunes.apple.com/us/app/revex/id1093924230'
                            ], 
                            advertiser_category: [ 'IAB1_6', 'IAB3_4' ]
                        });
                        expect(log.warn.calls.mostRecent().args).toEqual([
                            'Campaign %1 (%2) has no product.websites, falling ' +
                            'back to product.uri, but this may cause issues with Mopub. '+
                            'Replace advertiser_domain with actual site ASAP.',
                            'c-1234567', 'Revengus Extremis'         
                        ]);
                    });
                });

                describe('placement not beeswax, beeswax placement not mraid',function(){
                    beforeEach(function(done){
                        placements[0].tagParams.container = 'not-beeswax';
                        placements[1].tagType = 'other';
                        middleWare.createCreatives({
                            campaign   : campaign,
                            advertiser : advertiser,
                            placements : placements
                        }).then(function(res){
                            result = res;
                        }).then(done,done.fail);
                    });

                    it('returns one updated placement, one as it was',function(){
                        var sorted = result.placements.sort(sortPlacements);
                        expect(beeswax.uploadCreativeAsset).not.toHaveBeenCalled();
                        expect(beeswax.creatives.create).not.toHaveBeenCalled();
                        expect(sorted[0]).toEqual(
                            jasmine.objectContaining(
                                { id : 'p-1111111' }
                            )
                        );
                        expect(sorted[0].externalIds).not.toBeDefined();
                        expect(sorted[1]).toEqual(
                            jasmine.objectContaining(
                                { id : 'p-2222222' }
                            )
                        );
                        expect(sorted[1].externalIds).not.toBeDefined();
                    });
                });

                describe('two beeswax mraid placments',function(){
                    beforeEach(function(done){
                        middleWare.createCreatives({
                            campaign   : campaign,
                            advertiser : advertiser,
                            placements : placements
                        }).then(function(res){
                            result = res;
                        }).then(done,done.fail);
                    });

                    it('uploads the thumbnail',function(){
                        expect(beeswax.uploadCreativeAsset.calls.count()).toEqual(2);
                        expect(beeswax.uploadCreativeAsset.calls.allArgs()).toEqual([
                            [{
                                advertiser_id : 33,
                                sourceUrl : 'http://is3.mzstatic.com/image/thumb/1.jpg'
                            }],
                            [{
                                advertiser_id : 33,
                                sourceUrl : 'http://is3.mzstatic.com/image/thumb/2.jpg'
                            }]
                        ]);
                    });

                    it('returns two updated placements',function(){
                        var sorted = result.placements.sort(sortPlacements);
                        expect(sorted[0]).toEqual(
                            jasmine.objectContaining(
                                { id : 'p-1111111', externalIds : { beeswax : 1 }}
                            )
                        );
                        expect(sorted[1]).toEqual(
                            jasmine.objectContaining(
                                { id : 'p-2222222', externalIds : { beeswax : 2 }}
                            )
                        );
                    });
                });
            });

            describe('negative path',function(){
                it('bails if uploadCreativePlacement fails',function(done){
                    bwCreateCreativeDeferred.forEach(function(def,idx){
                        def.fulfill( { payload : { creative_id : (idx+1) } } );
                    });
                    
                    putPlacementDeferred.forEach(function(def,idx){
                        def.fulfill( [ updatedPlacement[idx] ] );
                    });

                    bwUploadAssetDeferred[0].fulfill({
                        path_to_asset : '/all/paths/lead/to/rome-1.jpg'
                    });
                    bwUploadAssetDeferred[1].reject(new Error('Fail.'));
                    
                    middleWare.createCreatives({
                        campaign   : campaign,
                        advertiser : advertiser,
                        placements : placements
                    }).then(done.fail, function(e){
                        expect(beeswax.uploadCreativeAsset.calls.count()).toEqual(2);
                        expect(e.message).toEqual('Fail.');
                        expect(beeswax.creatives.create.calls.count()).toEqual(1);
                        expect(request.put.calls.count()).toEqual(1);
                    }).then(done,done.fail);
                });

                it('bails if creatives.create fails',function(done){
                    bwUploadAssetDeferred.forEach(function(def,idx){
                        def.fulfill({
                            path_to_asset : '/all/paths/lead/to/rome-' + (idx+1) + '.jpg'
                        });
                    });
                    bwCreateCreativeDeferred[0].reject(new Error('Fail.'));
                    bwCreateCreativeDeferred[1].fulfill( 
                        { payload : { creative_id : 1 } } );
                    middleWare.createCreatives({
                        campaign   : campaign,
                        advertiser : advertiser,
                        placements : placements
                    }).then(done.fail, function(e){
                        expect(e.message).toEqual('Fail.');
                        expect(beeswax.uploadCreativeAsset.calls.count()).toEqual(2);
                        expect(beeswax.creatives.create.calls.count()).toEqual(2);
                        expect(request.put.calls.count()).toEqual(1);
                    }).then(done,done.fail);
                });
            });
        });

        describe('method: initShowcaseAppsCampaign',function(){
            beforeEach(function(){
                bwCreateCampaignDeferred.fulfill({ payload : {campaign_id:11}});
                bwCreateAdvertiserDeferred.fulfill({ payload : {advertiser_id:21}});
                
                getAdvertiserDeferred.fulfill([advertiser]);
                putAdvertiserDeferred.fulfill([updatedAdvert]);
                putCampaignDeferred.fulfill([updatedCampaign]);
                
                bwUploadAssetDeferred.forEach(function(def,idx){
                    def.fulfill({
                        path_to_asset : '/all/paths/lead/to/rome-' + (idx+1) + '.jpg'
                    });
                });

                bwCreateCreativeDeferred.forEach(function(def,idx){
                    def.fulfill( { payload : { creative_id : (idx+100) } } );
                });
                
                putPlacementDeferred.forEach(function(def,idx){
                    def.fulfill( [ updatedPlacement[idx] ] );
                });

                spyOn(middleWare,'createAdvertiser').and.callThrough();
                spyOn(middleWare,'createCampaign').and.callThrough();
                spyOn(middleWare,'createCreatives').and.callThrough();
            });

            it('intializes all related entities',function(done){
                middleWare.initShowcaseAppsCampaign({ 
                    campaign    : campaign,
                    placements  : placements
                })
                .then(function(res){ 
                    var sorted;
                    expect(middleWare.createAdvertiser).toHaveBeenCalled();
                    expect(middleWare.createCampaign).toHaveBeenCalled();
                    expect(middleWare.createCreatives).toHaveBeenCalled();
                    expect(res.campaign.externalIds.beeswax).toEqual(11);
                    expect(res.advertiser.externalIds.beeswax).toEqual(21);
                    sorted = res.placements.sort(sortPlacements);
                    expect(sorted[0]).toEqual(
                        jasmine.objectContaining(
                            { id : 'p-1111111', externalIds : { beeswax : 100 }}
                        )
                    );
                    expect(sorted[1]).toEqual(
                        jasmine.objectContaining(
                            { id : 'p-2222222', externalIds : { beeswax : 101 }}
                        )
                    );
                })
                .then(done,done.fail);
            });

            it('complains if there are no beeswax placements',function(done){
                placements[0].tagParams.container = 'not-beeswax';
                placements[1].tagType = 'other';
                middleWare.initShowcaseAppsCampaign({ 
                    campaign    : campaign,
                    placements  : placements
                })
                .then(done.fail,function(e){ 
                    expect(e.message).toEqual(
                        'Cannot initShowcaseAppsCampaign without beeswax placement.'
                    );
                    expect(middleWare.createAdvertiser).not.toHaveBeenCalled();
                    expect(middleWare.createCampaign).not.toHaveBeenCalled();
                    expect(middleWare.createCreatives).not.toHaveBeenCalled();
                })
                .then(done,done.fail);
            });
        });

        describe('method: upsertCampaignActiveLineItems', function(){
            var args;
            beforeEach(function(){
                campaign.externalIds = { beeswax : 11 };
                args = {
                    campaign : campaign,
                    startDate : '2016-07-01T00:00:00.000Z',
                    endDate : '2016-07-31T23:59:59.999Z'
                };
                bwFindCampaignDeferred.fulfill({ 
                    payload : {
                        campaign_id : 11,
                        advertiser_id : 55,
                        campaign_name : "my campaign",
                        campaign_budget : 1000,
                        start_date : '2016-01-27 00:00:00',
                        budget_type : 1
                    }
                });
                bwQueryCreativeDeferred.fulfill({ 
                    payload : [
                        { creative_id : 1000, advertiser_id : 55 }
                    ]
                });
                bwQueryLineItemDeferred.fulfill({
                    payload : [
                        { 
                            line_item_id : 100,
                            line_item_budget : 1000,
                            budget_type : 1
                        } 
                    ]
                });
            });
            it('complains if it does not receive campaign',function(done){
                delete args.campaign;
                middleWare.upsertCampaignActiveLineItems(args)
                .then(done.fail,function(e){
                    expect(e.message).toEqual(
                        'Object containing a campaign, startDate, endDate, multiplier is required.'
                    );
                })
                .then(done,done.fail);
            });
            it('complains if it does not receive startDate',function(done){
                delete args.startDate;
                middleWare.upsertCampaignActiveLineItems(args)
                .then(done.fail,function(e){
                    expect(e.message).toEqual(
                        'Object containing a campaign, startDate, endDate, multiplier is required.'
                    );
                })
                .then(done,done.fail);
            });
            it('complains if it does not receive endDate',function(done){
                delete args.endDate;
                middleWare.upsertCampaignActiveLineItems(args)
                .then(done.fail,function(e){
                    expect(e.message).toEqual(
                        'Object containing a campaign, startDate, endDate, multiplier is required.'
                    );
                })
                .then(done,done.fail);
            });
            it('complains if it does not receive multiplier',function(done){
                delete middleWare.defaultMultiplier;
                middleWare.upsertCampaignActiveLineItems(args)
                .then(done.fail,function(e){
                    expect(e.message).toEqual(
                        'Object containing a campaign, startDate, endDate, multiplier is required.'
                    );
                })
                .then(done,done.fail);
            });
            it('looks up the beeswax campaign',function(done){
                middleWare.upsertCampaignActiveLineItems(args)
                .then(function (res){
                    expect(beeswax.campaigns.find).toHaveBeenCalledWith(11);
                })
                .then(done,done.fail);
            });
            
            it('lookups up the beeswax campaign line items',function(done){
                middleWare.upsertCampaignActiveLineItems(args)
                .then(function (res){
                    expect(beeswax.campaigns.find).toHaveBeenCalledWith(11);
                    expect(beeswax.creatives.query).toHaveBeenCalledWith({
                        advertiser_id : 55, active : true    
                    });
                    expect(beeswax.lineItems.query).toHaveBeenCalledWith({
                        campaign_id : 11, active : true, start_date : '2016-06-30 20:00:00',
                            end_date : '2016-07-31 19:59:59'
                    });
                })
                .then(done,done.fail);
            });

            it('complains if it cannot find the beeswax campaign',function(done){
                bwFindCampaignDeferred = q.defer();
                bwFindCampaignDeferred.reject(new Error(
                    'No campaign found with that criteria'
                ));
                middleWare.upsertCampaignActiveLineItems(args)
                .then(done.fail,function (e){
                    expect(e.message).toEqual('No campaign found with that criteria');
                })
                .then(done,done.fail);
            });

            it('lookups up the beeswax campaign advertiser creatives',function(done){
                middleWare.upsertCampaignActiveLineItems(args)
                .then(function (res){
                    expect(beeswax.campaigns.find).toHaveBeenCalledWith(11);
                    expect(beeswax.creatives.query).toHaveBeenCalledWith({
                        advertiser_id : 55, active : true    
                    });
                })
                .then(done,done.fail);
            });
            
            it('complains if it cannot find the beeswax creatives',function(done){
                bwQueryCreativeDeferred = q.defer();
                bwQueryCreativeDeferred.fulfill({ payload : [] });
                middleWare.upsertCampaignActiveLineItems(args)
                .then(done.fail,function (e){
                    expect(e.message).toEqual('No active creatives found for campaign');
                })
                .then(done,done.fail);
            });

            describe('inserting new lineItem',function(){
                beforeEach(function(){
                    // bw campaign has budget of 1000 impressions
                    args.campaign.targetUsers = 500;
                    bwQueryLineItemDeferred = q.defer();
                    bwCreateLineItemDeferred = q.defer();
                    bwEditLineItemDeferred = q.defer();
                    bwQueryCreativeDeferred = q.defer();
                    bwCreateTargetingTemplDeferred = q.defer();
                    
                    bwQueryLineItemDeferred.fulfill({ payload : [] });
                    bwCreateTargetingTemplDeferred.fulfill({
                        payload : { targeting_template_id : 999 }
                    });
                    bwCreateLineItemDeferred.fulfill({
                        payload : { line_item_id : 111, active : false }
                    });
                    bwEditLineItemDeferred.fulfill({
                        payload : { line_item_id : 111, active : true }
                    });
                    bwQueryCreativeDeferred.fulfill({ 
                        payload : [
                            { creative_id : 1000, advertiser_id : 55 },
                            { creative_id : 1001, advertiser_id : 55 }
                        ]
                    });
                    bwCreateLineItemCreativeDeferred = [q.defer(),q.defer()];
                    bwCreateLineItemCreativeDeferred[0].fulfill({
                        payload : { id : 1 }
                    });
                    bwCreateLineItemCreativeDeferred[1].fulfill({
                        payload : { id : 2 }
                    });

                    beeswax.creativeLineItems.create =
                        jasmine.createSpy().and.callFake(function(){
                            return bwCreateLineItemCreativeDeferred.shift().promise;
                        });

                });

                it ('creates line item, leaves campaign if has sufficient budget',function(done){
                    middleWare.upsertCampaignActiveLineItems(args)
                    .then(function (res){
                        expect(beeswax.campaigns.find).toHaveBeenCalledWith(11);
                        expect(beeswax.creatives.query).toHaveBeenCalledWith({
                            advertiser_id : 55, active : true    
                        });
                        expect(beeswax.lineItems.query).toHaveBeenCalledWith({
                            campaign_id : 11,
                            active : true, 
                            start_date : '2016-06-30 20:00:00',
                            end_date : '2016-07-31 19:59:59'
                        });
                        expect(beeswax.targetingTemplates.create).toHaveBeenCalledWith({
                            template_name : 'Revengus Extremis 2016-01-27T21:22:47.464Z',
                            targeting : {
                                inventory: [ {
                                    include: {
                                        inventory_source: [ 3, 0 ], interstitial: [ true ], 
                                            environment_type: [ 1 ]
                                    }
                                } ],
                                geo: [ { include: { country: [ 'USA' ] } } ],
                                platform: [ { include: { os: [ 'iOS' ],
                                    device_model: [ 'iPhone' ] } } ],
                                segment: [ { include: { user_id: [ true ] } } ],
                                mobile_app: [ {
                                    exclude: { app_bundle_list: [ 1533, 1547, 1548, 2977 ] }
                                }]
                            },
                            strategy_id : 1,
                            active : true
                        });
                        expect(beeswax.lineItems.create).toHaveBeenCalledWith({
                            campaign_id : 11,
                            advertiser_id : 55,
                            line_item_type_id : 0,
                            targeting_template_id : 999,
                            line_item_name: 'my campaign 2016-06-30',
                            line_item_budget: 1000,
                            budget_type : 1,
                            bidding : { 
                                bidding_strategy: 'CPM_PACED', 
                                values : { cpm_bid : 10 }
                            },
                            start_date: '2016-06-30 20:00:00',
                            end_date : '2016-07-31 19:59:59',
                            active : false
                        });
                        expect(beeswax.creativeLineItems.create.calls.count()).toEqual(2);
                        expect(beeswax.creativeLineItems.create.calls.argsFor(0)).toEqual([{
                            creative_id:    1000,
                            line_item_id:   111,
                            active:         true
                        }]);
                        expect(beeswax.creativeLineItems.create.calls.argsFor(1)).toEqual([{
                            creative_id:    1001,
                            line_item_id:   111,
                            active:         true
                        }]);
                        expect(beeswax.lineItems.edit).toHaveBeenCalledWith(111,{
                            active : true
                        });
                    })
                    .then(done,done.fail);
                });
            });
           
            describe('increasing targetUsers',function(){
                beforeEach(function(){
                    bwFindCampaignDeferred = q.defer();
                    bwFindCampaignDeferred.fulfill({ 
                        payload : {
                            campaign_id : 11,
                            advertiser_id : 55,
                            campaign_name : "my campaign",
                            campaign_budget : 6000,
                            start_date : '2016-01-27 00:00:00',
                            budget_type : 1
                        }
                    });
                    args.campaign.targetUsers = 1000;
                });
                it('increases line item budget, leaves campaign alone if budget is large enough',function(){
                    bwQueryLineItemDeferred.fulfill({
                        payload : [
                            { 
                                line_item_id : 100,
                                line_item_budget : 1000,
                                budget_type : 1
                            } 
                        ]
                    });
                });
                it('increases line item budget, increases campaign budget if not large enough',function(){


                });
            });

            describe('decreasing targetUsers',function(){
                beforeEach(function(){
                    args.campaign.targetUsers = 1000;
                });
                it('decreases line item budget',function(){


                });
            });

        });
    });
});
