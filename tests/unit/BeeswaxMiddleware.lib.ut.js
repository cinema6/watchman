describe('BeeswaxMiddleware(config)', function() {
    'use strict';

    describe('instance:', function() {
        var q, ld;
        var BeeswaxClient, BeeswaxMiddleware, CwrxRequest;
        var middleWare, request, beeswax, advertiser;
        var bwCreateAdvertiserDeferred;
        var putAdvertiserDeferred, getAdvertiserDeferred;

        beforeAll(function(){
            q  = require('q');
            ld = require('lodash');

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

        beforeEach(function() {
            advertiser = {
                id      : 'a-1234567',
                name    : 'ACME TNT',
                externalIds : { beeswax : 1 }
            };

            middleWare  = new BeeswaxMiddleware(
                {
                    api: { root: 'http://33.33.33.10/' },
                    creds: { email : 'bu@g.z', password : 'x' }
                },
                {
                    api: {
                        root: 'http://33.33.33.10/',
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
            putAdvertiserDeferred       = q.defer();
            getAdvertiserDeferred       = q.defer();

            spyOn(beeswax.advertisers,'create')
                .and.returnValue(bwCreateAdvertiserDeferred.promise);
            
            spyOn(request, 'put').and.callFake(function(opts){
                if(opts.url.match(/\/api\/account\/advertisers/)){
                    return putAdvertiserDeferred.promise;
                }
                return q.reject('Unexpected PUT');
            });
            
            spyOn(request, 'get').and.callFake(function(opts){
                if(opts.url.match(/\/api\/account\/advertisers/)){
                    return getAdvertiserDeferred.promise;
                }
                return q.reject('Unexpected GET');
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
            var result;

            describe('with no beeswax ids',function(){
                var updatedAdvert;
                beforeEach(function(done){
                    delete advertiser.externalIds;
                    bwCreateAdvertiserDeferred.fulfill({ payload : {advertiser_id:1}});
                    getAdvertiserDeferred.fulfill([advertiser]);
                    process.nextTick(done);
                });

                beforeEach(function(done){
                    updatedAdvert = ld.assign({},advertiser,{ externalIds: { beeswax : 1 }});
                    putAdvertiserDeferred.fulfill([updatedAdvert]);
                    process.nextTick(done);
                });

                beforeEach(function(done){
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

                it('returns a valid advertiser',function(){
                    expect(result).toEqual(updatedAdvert);
                });

            });
            
            describe('with old beeswax id structure',function(){
                var updatedAdvert;
                beforeEach(function(done){
                    delete advertiser.externalIds;
                    advertiser.beeswaxIds = { advertiser : 2 };
                    getAdvertiserDeferred.resolve([advertiser]);
                    process.nextTick(done);
                });

                beforeEach(function(done){
                    updatedAdvert = ld.assign({},advertiser,{ externalIds: { beeswax : 2 }});
                    putAdvertiserDeferred.resolve([updatedAdvert]);
                    process.nextTick(done);
                });

                beforeEach(function(done){
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
                
                it('returns a valid advertiser',function(){
                    expect(result).toEqual(updatedAdvert);
                });


            });

            describe('with current beeswax id structure',function(){
                beforeEach(function(done){
                    advertiser.externalIds = { beeswax : 3 };
                    getAdvertiserDeferred.resolve([advertiser]);
                    process.nextTick(done);
                });

                beforeEach(function(done){
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

                it('returns a valid advertiser',function(){
                    expect(JSON.stringify(result)).toEqual(JSON.stringify(advertiser));
                });

            });
        });
    });

});
