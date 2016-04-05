'use strict';

module.exports = jasmine.createSpy('action1()').and.callFake(function() {
    return 'my name is mock action one, ' + Math.random();
});
