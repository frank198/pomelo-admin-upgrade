'use strict';

class Protocol
{
    static composeRequest(id, moduleId, body)
    {
        const requestObject = {
            moduleId : moduleId,
            body     : body
        };
        if (id)
        {
            requestObject.reqId = id;
            return JSON.stringify(requestObject);
        }
        return requestObject;
    }

    static composeResponse(req, err, res)
    {
        if (req.reqId)
        {
            return JSON.stringify({
                respId : req.reqId,
			    error  : ProtocolUtility.CloneError(err),
			    body   : res
            });
        }
        return null;
    }

    static composeCommand(id, command, moduleId, body)
    {
        const requestObject = {
            command  : command,
            moduleId : moduleId,
            body     : body
        };
        if (id)
        {
            requestObject.reqId = id;
        }
        return JSON.stringify(requestObject);
    }

    static parse(msg)
    {
        if (typeof msg === 'string')
        {
            return JSON.parse(msg);
        }
        return msg;
    }

    static isRequest(msg)
    {
        return (msg && msg.reqId);
    }

    static get PRO_OK()
    {
        return 1;
    }

    static get PRO_FAIL()
    {
        return -1;
    }
}

class ProtocolUtility
{
    static CloneError(origin)
    {
        if (!(origin instanceof Error))
        {
            return origin;
        }
        return {
            message : origin.message,
            stack   : origin.stack
        };
    }
}

module.exports = Protocol;