'use strict';

const proxyquire = require('proxyquire').noCallThru();

describe('BeeswaxMiddleware(config)', function() {

    describe('instance:', function() {
        var url, q, ld;
        var BeeswaxClient, BeeswaxMiddleware, CwrxRequest;
        var middleWare, request, beeswax, advertiser, campaign, placements;
        var bwCreateAdvertiserDeferred, bwCreateCampaignDeferred,
            bwCreateCreativeDeferred, bwUploadAssetDeferred;
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
                    campaigns : { create : function() { return null; }},
                    creatives : { create : function() { return null; }},
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
            
            spyOn(beeswax,'uploadCreativeAsset').and.callFake(function(opts){
                var def = bwUploadAssetDeferred[ ld.findIndex( placements,
                    function(v) { return v.thumbnail === opts.sourceUrl; }) ];

                return def !== undefined ? def.promise : q.reject( 
                    new Error('Unexpected creative url: ' + opts.sourceUrl));
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
                            advertiser_domain : [ 'https://itunes.apple.com' ],
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

                describe('one beeswax placement not mraid',function(){
                    beforeEach(function(done){
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
                    expect(e.message).toEqual('Cannot initShowcaseAppsCampaign without beeswax placement.');
                    expect(middleWare.createAdvertiser).not.toHaveBeenCalled();
                    expect(middleWare.createCampaign).not.toHaveBeenCalled();
                    expect(middleWare.createCreatives).not.toHaveBeenCalled();
                })
                .then(done,done.fail);
            });
        });
    });
});
