'use strict';

class CountDownLatch
{
    constructor(count, opts, callBack)
    {
        this.count = count;
        this.cb = callBack;
        if (opts.timeout)
        {
            this.timerId = setTimeout(() =>
            {
                this.cb(true);
            }, opts.timeout);
        }
    }

    done()
    {
        if (this.count <= 0)
        {
            throw new Error('illegal state.');
        }

        this.count--;
        if (this.count === 0)
        {
            if (this.timerId)
            {
                clearTimeout(this.timerId);
            }
            this.cb();
        }
    }

    static CreateCountDownLatch(count, opts, callBack)
    {
        if (!count || count <= 0)
        {
            throw new Error('count should be positive.');
        }

        if (!callBack && typeof opts !== 'function')
        {
            callBack = opts;
            opts = {};
        }

        if(typeof callBack !== 'function')
        {
            throw new Error('cb should be a function.');
        }

        return new CountDownLatch(count, opts, callBack);
    }
}

module.exports = CountDownLatch.CreateCountDownLatch;