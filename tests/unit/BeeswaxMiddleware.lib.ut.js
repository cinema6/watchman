fdescribe('BeeswaxMiddleware(config)', function() {
    'use strict';

    describe('instance:', function() {
        var url, q, ld;
        var BeeswaxClient, BeeswaxMiddleware, CwrxRequest;
        var middleWare, request, beeswax, advertiser, campaign, placements;
        var bwCreateAdvertiserDeferred, bwCreateCampaignDeferred,
            bwCreateCreativeDeferred, bwUploadAssetDeferred;
        var putAdvertiserDeferred, getAdvertiserDeferred,
            putCampaignDeferred, putPlacementDeferred;

        beforeAll(function(){
            jasmine.clock().install();
            //Wed Jan 27 2016 16:22:47 GMT-0500 (EST)
            jasmine.clock().mockDate(new Date(1453929767464));

            q  = require('q');
            ld = require('lodash');
            url = require('url');

            delete require.cache[require.resolve('../../lib/CwrxRequest')];
            CwrxRequest = (function(CwrxRequest) {
                return jasmine.createSpy('CwrxRequest()').and.callFake(function(creds) {
                    var request = new CwrxRequest(creds);
                    spyOn(request, 'send').and.returnValue(q.defer().promise);
                    return request;
                });
            }(require('../../lib/CwrxRequest')));
            require.cache[require.resolve('../../lib/CwrxRequest')].exports = CwrxRequest;
            
            delete require.cache[require.resolve('beeswax-client')];
            BeeswaxClient = (function(BeeswaxClient) {
                return jasmine.createSpy('BeeswaxClient()').and.callFake(function(creds) {
                    var beeswax = new BeeswaxClient(creds);
                    return beeswax;
                });
            }(require('beeswax-client')));
            require.cache[require.resolve('beeswax-client')].exports = BeeswaxClient;

            delete require.cache[require.resolve('../../lib/BeeswaxMiddleware')];
            BeeswaxMiddleware = require('../../lib/BeeswaxMiddleware');
        });
        
        afterAll(function() {
            jasmine.clock().uninstall();
        });

        beforeEach(function() {
            advertiser = {
                id      : 'a-1234567',
                name    : 'ACME TNT',
                externalIds : { beeswax : 100 }
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
                    categories : [ 'Music', 'Business' ]
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

            middleWare  = new BeeswaxMiddleware(
                {
                    api: { root: 'http://33.33.33.10/' },
                    creds: { email : 'bu@g.z', password : 'x' }
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
                }
            );

            request  = CwrxRequest.calls.mostRecent().returnValue;
            beeswax  = BeeswaxClient.calls.mostRecent().returnValue;
        });

        beforeEach(function(){
            bwCreateAdvertiserDeferred  = q.defer();
            bwCreateCampaignDeferred    = q.defer();
            bwCreateCreativeDeferred    = q.defer();
            bwUploadAssetDeferred       = q.defer();
            getAdvertiserDeferred       = q.defer();
            putAdvertiserDeferred       = q.defer();
            putCampaignDeferred         = q.defer();
            putPlacementDeferred        = q.defer();


            spyOn(beeswax.advertisers,'create')
                .and.returnValue(bwCreateAdvertiserDeferred.promise);

            spyOn(beeswax.campaigns,'create')
                .and.returnValue(bwCreateCampaignDeferred.promise);

            spyOn(beeswax.creatives,'create')
                .and.returnValue(bwCreateCreativeDeferred.promise);

            spyOn(beeswax,'uploadCreativeAsset')
                .and.returnValue(bwUploadAssetDeferred.promise);

            spyOn(request, 'get')
                .and.callFake(function(opts){
                    if(opts.url.match(/\/api\/account\/advertisers/)){
                        return getAdvertiserDeferred.promise;
                    }
                    return q.reject('Unexpected GET');
                });
            
            spyOn(request, 'put');
            
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
        });

        describe('method: createAdvertiser',function(){
            var result ;

            beforeEach(function(done){
                var updatedAdvert = {};
                bwCreateAdvertiserDeferred.fulfill({ payload : {advertiser_id:1}});
                getAdvertiserDeferred.fulfill([advertiser]);
                putAdvertiserDeferred.fulfill([updatedAdvert]);

                request.put.and.callFake(function(opts){
                    ld.assign(updatedAdvert,advertiser,opts.json);
                    return putAdvertiserDeferred.promise;
                });

                process.nextTick(done);
            });
            
            describe('from c6 Advertiser with no beeswax ids',function(){
                beforeEach(function(done){
                    delete advertiser.externalIds;
                    middleWare.createAdvertiser({ id : 'a-1234567' })
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
                    expect(result.externalIds.beeswax).toEqual(1);
                });

            });
            
            describe('from c6 Advertiser with old beeswax id structure',function(){
                beforeEach(function(done){
                    delete advertiser.externalIds;
                    advertiser.beeswaxIds = { advertiser : 2 };
                    middleWare.createAdvertiser({ id : 'a-1234567' })
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
                    expect(result.externalIds.beeswax).toEqual(2);
                });
            });

            describe('from c6 Advertiser with current beeswax id structure',function(){
                beforeEach(function(done){
                    advertiser.externalIds = { beeswax : 3 };
                    middleWare.createAdvertiser({ id : 'a-1234567' })
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
                    expect(result).toEqual(advertiser);
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
                    middleWare.createAdvertiser({ id : 'a-1234567' })
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
                    middleWare.createAdvertiser({ id : 'a-1234567' })
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
                var updatedCampaign = {};
                putCampaignDeferred.fulfill([updatedCampaign]);

                request.put.and.callFake(function(opts){
                    ld.assign(updatedCampaign,campaign,opts.json);
                    return putCampaignDeferred.promise;
                });

                process.nextTick(done);
            });

            it('creates a beeswax campaign',function(done){
                bwCreateCampaignDeferred.fulfill({ payload : {campaign_id:11}});
                middleWare.createCampaign({ campaign: campaign, advertiser : advertiser})
                .then(function(res){ 
                    expect(beeswax.campaigns.create).toHaveBeenCalledWith({
                        advertiser_id : 100,
                        alternative_id : 'c-1234567',
                        campaign_name : 'Revengus Extremis',
                        start_date : '2016-01-27 00:00:00',
                        active : false
                    });
                    expect(request.put).toHaveBeenCalled();
                    expect(res.externalIds.beeswax).toEqual(11);
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
            describe('single placement',function(){
                beforeEach(function(){
                    placements.pop();
                });
               
                describe('postive path',function(){
                    var result, updatedPlacement;

                    beforeEach(function(done){
                        updatedPlacement = {};

                        bwUploadAssetDeferred.resolve({
                            path_to_asset : '/all/paths/lead/to/rome.jpg'    
                        });
                        bwCreateCreativeDeferred.resolve({ payload : { creative_id : 44 }});
                        
                        putPlacementDeferred.fulfill([updatedPlacement]);

                        request.put.and.callFake(function(opts){
                            var placement, id;
                            if(opts.url.match(/\/api\/placements/)){
                                id = url.parse(opts.url).pathname.split('/')[3];
                                console.log('PARSED:',id);
                                placement = ld.find(placements,
                                    function(v) { return v.id === id });
                                ld.assign(updatedPlacement,placement,opts.json);
                                return putPlacementDeferred.promise;
                            }

                            return q.reject('Unexpected PUT');
                        });
                        middleWare.createCreatives({
                            campaign   : campaign,
                            advertiser : advertiser,
                            placements : placements
                        }).then(function(res){
                            result = res;
                        }).then(done,done.fail);
                    });

                    it('uploads the thumbnail',function(){
                        expect(beeswax.uploadCreativeAsset).toHaveBeenCalledWith({
                            advertiser_id : 100,
                            sourceUrl     : 'http://is3.mzstatic.com/image/thumb/1.jpg'
                        });
                    });

                    it('uploads a creative with the thumbnail',function(){
                        expect(beeswax.creatives.create).toHaveBeenCalled();
                        var req = beeswax.creatives.create.calls.argsFor(0)[0];
                        expect(req.advertiser_id).toEqual(100);
                        expect(req.creative_name).toEqual('MRAID Inter: Revengus Extremis');
                        expect(req.creative_content.ADDITIONAL_PIXELS[0].PIXEL_URL)
                            .toEqual(
                                'http://audit.rc.com/pixel.gif?placement=p-1111111' +
                                '&campaign=c-1234567&card=rc-1111111&container=beeswax&' +
                                'event=impression&hostApp={{APP_BUNDLE}}&' +
                                'network={{INVENTORY_SOURCE}}&cb={{CACHEBUSTER}}'
                            );
                        expect(req.creative_attributes.advertiser).toEqual({
                            advertiser_domain : [ 'https://itunes.apple.com' ],
                            landing_page_url: [ 
                                'https://itunes.apple.com/us/app/revex/id1093924230'
                            ], 
                            advertiser_category: [ 'IAB1_6', 'IAB3_4' ]
                        });
                    });

                    it('updates the placement with the beeswax creative_id',function(){
                        expect(request.put).toHaveBeenCalledWith({
                            url : 'http://33.33.33.10/api/placements/p-1111111',
                            json : {
                                externalIds : { beeswax : 44 }
                            }
                        });
                    });

                    it('returns the updated placements',function(){
                        expect(result[0]).toEqual(
                            jasmine.objectContaining(
                                { id : 'p-1111111', externalIds : { beeswax : 44 }}
                            )
                        );
                    });
                });

                describe('negative path',function(){
                    it('does nothing if the placement is not for beeswax',function(done){
                        placements[0].tagParams.container = 'other';
                        middleWare.createCreatives({
                            campaign   : campaign,
                            advertiser : advertiser,
                            placements : placements
                        }).then(function(res){
                            expect(beeswax.uploadCreativeAsset).not.toHaveBeenCalled();
                            expect(beeswax.creatives.create).not.toHaveBeenCalled();
                            expect(request.put).not.toHaveBeenCalled();
                        }).then(done,done.fail);
                    });

                    it('does nothing if the placement tagType is not mraid',function(done){
                        placements[0].tagType = 'other';
                        middleWare.createCreatives({
                            campaign   : campaign,
                            advertiser : advertiser,
                            placements : placements
                        }).then(function(res){
                            expect(beeswax.uploadCreativeAsset).not.toHaveBeenCalled();
                            expect(beeswax.creatives.create).not.toHaveBeenCalled();
                            expect(request.put).not.toHaveBeenCalled();
                        }).then(done,done.fail);
                    });

                    it('bails if uploadCreativePlacement fails',function(done){
                        bwUploadAssetDeferred.reject(new Error('Fail.'));
                        middleWare.createCreatives({
                            campaign   : campaign,
                            advertiser : advertiser,
                            placements : placements
                        }).then(done.fail, function(e){
                            expect(beeswax.uploadCreativeAsset).toHaveBeenCalled();
                            expect(e.message).toEqual('Fail.');
                            expect(beeswax.creatives.create).not.toHaveBeenCalled();
                            expect(request.put).not.toHaveBeenCalled();
                        }).then(done,done.fail);
                    });

                    it('bails if creatives.create fails',function(done){
                        bwUploadAssetDeferred.resolve({
                            path_to_asset : '/all/paths/lead/to/rome.jpg'    
                        });
                        bwCreateCreativeDeferred.reject(new Error('Fail.'));
                        middleWare.createCreatives({
                            campaign   : campaign,
                            advertiser : advertiser,
                            placements : placements
                        }).then(done.fail, function(e){
                            expect(e.message).toEqual('Fail.');
                            expect(beeswax.uploadCreativeAsset).toHaveBeenCalled();
                            expect(beeswax.creatives.create).toHaveBeenCalled();
                            expect(request.put).not.toHaveBeenCalled();
                        }).then(done,done.fail);
                    });
                });
            });
        });

        describe('method: initShowcaseAppsCampaign',function(){
            beforeEach(function(done){
                var updatedAdvert = {}, updatedCampaign = {};
                
                bwCreateCampaignDeferred.fulfill({ payload : {campaign_id:11}});
                bwCreateAdvertiserDeferred.fulfill({ payload : {advertiser_id:1}});
                
                getAdvertiserDeferred.fulfill([advertiser]);
                putAdvertiserDeferred.fulfill([updatedAdvert]);
                putCampaignDeferred.fulfill([updatedCampaign]);

                request.put.and.callFake(function(opts){
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

                process.nextTick(done);
            });
            
            it('intializes all related entities',function(done){
                middleWare.initShowcaseAppsCampaign({ campaign: campaign })
                .then(function(res){ 
                    expect(beeswax.campaigns.create).toHaveBeenCalledWith({
                        advertiser_id : 100,
                        alternative_id : 'c-1234567',
                        campaign_name : 'Revengus Extremis',
                        start_date : '2016-01-27 00:00:00',
                        active : false
                    });
                    expect(request.put).toHaveBeenCalled();
                    expect(res.externalIds.beeswax).toEqual(11);
                })
                .then(done,done.fail);
            });
        });
    });

});
