window.Widgets = window.Widgets || {};
window.Widgets.Events = window.Widgets.Events || {};

//define your function
(function($, ns) {

    //only works on same origin
    //listen for broadcast messages on dedicated channel
    try {
        if (typeof BroadcastChannel !== 'undefined') {
            ns.broadcastChannel = new BroadcastChannel('widget:embed');
        }
    } catch (err) {
        console.warn('BroadcastChannel unavailable', err);
    }

    //only works on same origin
    ns.broadcastListener = function(callback) {
        console.group(`broadcastListener on ${window.location}`);
        ns.broadcastChannel.onmessage = function(event) {
            console.groupCollapsed(`widget broadcastListener on ${window.location}`);
            let eventData = event.data;
            let sourceWindow = event.source;
            let sourceOrigin = event.origin;

            console.log('eventData', eventData);
            console.log('sourceWindow', sourceWindow);
            console.log('sourceOrigin', sourceOrigin);

            if (eventData) {
                let sourceData = eventData;
                console.log('sourceData', sourceData);

                if (typeof sourceData === 'string') {
                    sourceData = JSON.parse( sourceData );
                }
                //is message for parent?
                if (sourceData.target === 'parent') {
                    console.log('ignoring, message for parent, possible loop or no parent');
                    console.groupEnd();
                    return;
                }        

                if (!sourceData) {
                    console.log('no sourceData');
                    console.groupEnd();
                    return;
                }
                if (callback) {
                    console.log('callback', callback);
                    callback(sourceData);
                }
            } else {
                console.warn('no eventData');
            }

            console.groupEnd();
        }
        console.groupEnd();
    };

    /**
     * Compile event data
     * @param {Object} payload data to be sent
     * @param {String} eventName name of the event / type / topicName
     * @param {String} action action to be taken by the event, this is undestood by the component
     * @param {String} componentId id of the component, relevant for the component
     * @param {Object} config additional config for the event
     * @param {String} target possible target for the event, default is "parent", parent will be ignored by windowListener
     */
    ns.compileEventData = (payload, eventName, action, componentId, config, target) => ({ 
        type: eventName, 
        payload: payload, 
        action: action, 
        componentId: componentId, 
        config: config,
        target: target || "parent"
    });

    ns.windowListener = function(callback) {
        console.group(`windowListener on ${window.location}`);
        window.addEventListener("message", function(event) {
            console.groupCollapsed(`widget windowListener on ${window.location}`);
            let eventData = event.data;
            let sourceWindow = event.source;
            let sourceOrigin = event.origin;

            console.log('eventData', eventData);
            console.log('sourceWindow', sourceWindow);
            console.log('sourceOrigin', sourceOrigin);

            if (eventData) {
                let sourceData = eventData;
                console.log('sourceData', sourceData);

                if (typeof sourceData === 'string') {
                    sourceData = JSON.parse( sourceData );
                }
                //is message for parent?
                if (sourceData.target === 'parent') {
                    console.log('ignoring, message for parent, possible loop or no parent');
                    console.groupEnd();
                    return;
                }        

                if (!sourceData) {
                    console.log('no sourceData');
                    console.groupEnd();
                    return;
                }
                if (callback) {
                    console.log('callback', callback);
                    callback(sourceData);
                }
            } else {
                console.warn('no eventData');
            }

            console.groupEnd();
        });
        console.groupEnd();
    }
    
    ns.raiseEvent = function(eventName, data) {
        console.group(`raiseEvent on ${window.location}`);
        let event = new CustomEvent(eventName, {
          detail: data,
        });
        console.log("event", event);
        console.log("window.parent", window.parent);

        if (window.parent) {
          window.parent.postMessage(JSON.stringify(data), "*");
          console.log("postMessage to parent", data);
        } else {
          window.dispatchEvent(event);
          console.warn("this doc is not in iFrame, dispatchEvent", event);
        }
        console.groupEnd();
      }

})(window.jQuery, window.Widgets.Events);