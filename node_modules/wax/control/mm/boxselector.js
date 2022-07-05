wax = wax || {};
wax.mm = wax.mm || {};

wax.mm.boxselector = function(map, tilejson, opts) {
    // Set this to true if you want all of the boxselector functions to write to the 
    // console when they execute.
    var logFunctions = false;
    if (logFunctions) { console.log("boxselector.initializing..."); }

    var callback = ((typeof opts === 'function') ? opts : opts.callback),
        boxDiv,
        style,
        mouseDownPoint   = null, // Location where the mouse is initially clicked down.
        mouseDownCursor  = null, // Cursor style from when the mouse was clicked down.
        drawNewBox       = false, // User shift-clicked and wants to draw a new box.
        clickedInsideBox = false; // User clicked inside the box and wants to move the box.
    // Type of resize being used (mini or normal). Mini is used during the initial stages 
    // of drawing a new box. Normal is used when the user clicks on an edge of the box or 
    // after a new box is big enough to determine which way the user is dragging.
    var resizeType = null;
    // Number of pixels from the top right of the map to the left, right, top, or bottom of the box.
    var boxWest   = 0,
        boxEast   = 0,
        boxNorth  = 0,
        boxSouth  = 0;
    // Indication of what part of the box the user clicked on.
    var onWestEdge  = false,
        onEastEdge  = false,
        onNorthEdge = false,
        onSouthEdge = false;
    // Indication of what part of the box should be calculated when the aspect ratio is locked.
    var calculateWestEdge  = false,
        calculateEastEdge  = false,
        calculateNorthEdge = false,
        calculateSouthEdge = false;
    // Indicates whether the north/south edges are dominant or the east/west edges are dominant
    // when the aspect ratio is locked and the user clicks in a corner.
    var northSouthDominant = true;
    var borderWidth = 0,     // Width of the box border.
        edge        = 5,     // Distance from border sensitive to resizing.
        addEvent    = MM.addEvent,
        removeEvent = MM.removeEvent,
        box,
        boxselector = {};

    function getMousePoint(e) {
        //if (logFunctions) { console.log("boxselector.getMousePoint..."); }

        // start with just the mouse (x, y)
        var point = new MM.Point(e.clientX, e.clientY);
        // correct for scrolled document
        point.x += document.body.scrollLeft + document.documentElement.scrollLeft;
        point.y += document.body.scrollTop + document.documentElement.scrollTop;

        // correct for nested offsets in DOM
        for (var node = map.parent; node; node = node.offsetParent) {
            point.x -= node.offsetLeft;
            point.y -= node.offsetTop;
        }
        return point;
    }

    // Figure out if the point is on any box edges and return edge which edges it is on.
    function whichBoxEdges(point) {
        if (logFunctions) { console.log("boxselector.whichBoxEdges..."); }

        // Calculate the top/left offset values for each side of the box.
        var west  = parseInt(boxDiv.offsetLeft, 10),
            east  = west  + parseInt(boxDiv.offsetWidth, 10),
            north = parseInt(boxDiv.offsetTop, 10),
            south = north + parseInt(boxDiv.offsetHeight, 10);

        // Figure out if the user clicked near a box edge. If they did, determine which edge 
        // they are going to drag (to resize the box). If they clicked near a corner, then 
        // two of the values below will be true.
        var nearWestEdge  = (Math.abs(west  - point.x) <= edge) ? true : false,
            nearEastEdge  = (Math.abs(east  - point.x) <= edge) ? true : false,
            nearNorthEdge = (Math.abs(north - point.y) <= edge) ? true : false,
            nearSouthEdge = (Math.abs(south - point.y) <= edge) ? true : false,
            betweenWE = ((west  - edge) < point.x && point.x < (east  + edge)) ? true : false,
            betweenNS = ((north - edge) < point.y && point.y < (south + edge)) ? true : false;
        var onEdge = {
            west:  (nearWestEdge  && betweenNS) ? true : false,
            east:  (nearEastEdge  && betweenNS) ? true : false,
            north: (nearNorthEdge && betweenWE) ? true : false,
            south: (nearSouthEdge && betweenWE) ? true : false
        };
        return (onEdge);
    }

    // Figure out if the point is on any box edges and return edge which edges it is on.
    function whichBoxEdgesBasedOnClosestCorner(point) {
        if (logFunctions) { console.log("boxselector.whichBoxEdgesBasedOnClosestCorner..."); }

        // Calculate the top/left offset values for each side of the box.
        var west  = parseInt(boxDiv.offsetLeft, 10),
            east  = west  + parseInt(boxDiv.offsetWidth, 10),
            north = parseInt(boxDiv.offsetTop, 10),
            south = north + parseInt(boxDiv.offsetHeight, 10);

        // Find the closest box corner to the current cursor location and set the edges
        // appropriately.
        var onEdge = {
            west:  (Math.abs(west  - point.x) < Math.abs(east  - point.x)) ? true  : false,
            east:  (Math.abs(east  - point.x) < Math.abs(west  - point.x)) ? true  : false,
            north: (Math.abs(north - point.y) < Math.abs(south - point.y)) ? true : false,
            south: (Math.abs(south - point.y) < Math.abs(north - point.y)) ? true : false
        };
        return (onEdge);
    }

    // Figure out if the point is inside the box and not near the edges.
    function insideBox(point) {
        //if (logFunctions) { console.log("boxselector.insideBox..."); }

        // If we are between mouseDown and mouseUp, we may have already figured this out. 
        // If we did and we are inside the box, no point in checking again.
        if (clickedInsideBox) return true;

        // Calculate the top/left offset values for each side of the box.
        var west  = parseInt(boxDiv.offsetLeft, 10),
            east  = west + parseInt(boxDiv.offsetWidth, 10),
            north = parseInt(boxDiv.offsetTop, 10),
            south = north + parseInt(boxDiv.offsetHeight, 10);

        // Figure out if the user clicked inside the box.
        var betweenWestAndEast   = ((west + edge)  < point.x && 
                                    point.x < (east - edge))  ? true : false,
            betweenNorthAndSouth = ((north + edge) < point.y && 
                                    point.y < (south - edge)) ? true : false;

        return (betweenWestAndEast && betweenNorthAndSouth);
    }

    // Figure out if the point is outside the box and not near the edges.
    function outsideBox(point) {
        //if (logFunctions) { console.log("boxselector.outsideBox..."); }

        // If we are between mouseDown and mouseUp, we may have already figured this out. 
        // If we did and we are inside the box, no point in checking again.
        if (clickedInsideBox) return false;

        // Calculate the top/left offset values for each side of the box.
        var west  = parseInt(boxDiv.offsetLeft, 10),
            east  = west + parseInt(boxDiv.offsetWidth, 10),
            north = parseInt(boxDiv.offsetTop, 10),
            south = north + parseInt(boxDiv.offsetHeight, 10);

        // Figure out if the user clicked inside the box.
        var outsideOfWestAndEast   = (point.x < (west - edge)  || 
                                     (east + edge)  < point.x) ? true : false,
            outsideOfNorthAndSouth = (point.y < (north - edge) || 
                                     (south + edge) < point.y) ? true : false;

        return (outsideOfWestAndEast || outsideOfNorthAndSouth);
    }

    // See if the aspect ratio is locked.
    function aspectLocked() {
        if (logFunctions) { console.log("boxselector.aspectLocked..."); }

        //timtim TODO: Create an abstraction to remove the dependency on the client.
        return (document.getElementsByName('setaspect').item(0).checked);
    }

    // If the aspect ratio is locked, then return the aspect ratio.
    function aspectRatio() {
        if (logFunctions) { console.log("boxselector.aspectRatio..."); }

        //timtim TODO: Create an abstraction to remove the dependency on the client.
        if (aspectLocked()) {
            var aspectWidth = document.getElementsByName('aspectwidth').item(0).value;
            var aspectHeight = document.getElementsByName('aspectheight').item(0).value;
            if (!aspectWidth || !aspectHeight) {
                // If either width or height is zero or undefined, then return 1 as a default.
                return 1;
            }
            else {
                // Return the aspect ratio.
                return (parseFloat(aspectWidth) / parseFloat(aspectHeight));
            }
        }
        else {
            return 0;
        }
    }

    // Prepare for doing a normal resize of a box.
    function prepForResize(point) {
        if (logFunctions) { console.log("boxselector.prepForResize..."); }

        // Calculate the top/left offset values for each side of the box.
        boxWest  = parseInt(boxDiv.offsetLeft, 10);
        boxEast  = boxWest + parseInt(boxDiv.offsetWidth, 10);
        boxNorth = parseInt(boxDiv.offsetTop, 10);
        boxSouth = boxNorth + parseInt(boxDiv.offsetHeight, 10);

        // If aspect ratio is locked then figure out which is the dragging side and which is
        // the calculated side.
        if (aspectLocked()) {
            // If the user clicked in a corner and the aspect ratio locked, then pick which
            // edge will be dominant and unset the dragging indicator for the other edge so
            // that it can be calculated.
            if (northSouthDominant && (onNorthEdge || onSouthEdge)) {
                onWestEdge = false;
                onEastEdge = false;
            }
            else if (!northSouthDominant && (onWestEdge || onEastEdge)) {
                onNorthEdge = false;
                onSouthEdge = false;
            }

            // Set the calculated side based on which non-dragging side they clicked closest to.
            if (onNorthEdge || onSouthEdge) {
                var distanceToWestEdge = Math.abs(point.x - boxWest);
                var distanceToEastEdge = Math.abs(point.x - boxEast);
                calculateWestEdge = (distanceToWestEdge <= distanceToEastEdge) ? true : false;
                calculateEastEdge = (distanceToWestEdge >  distanceToEastEdge) ? true : false;
            }
            else if (onWestEdge || onEastEdge) {
                var distanceToNorthEdge = Math.abs(point.y - boxNorth);
                var distanceToSouthEdge = Math.abs(point.y - boxSouth);
                calculateNorthEdge = (distanceToNorthEdge <= distanceToSouthEdge) ? true : false;
                calculateSouthEdge = (distanceToNorthEdge >  distanceToSouthEdge) ? true : false;
            }
        }

        // Change the resizeType to normal now that we are all prepped for a normal resize.
        resizeType = 'normal';
    }

    // User clicked somewhere.
    function mouseDown(e) {
        if (logFunctions) { console.log("boxselector.mouseDown..."); }

        mouseDownPoint = getMousePoint(e); // Get the current mouse pointer location.

        if (e.shiftKey) { // The user wants to draw a new box.
            drawNewBox = true; // Remember that we are drawing a new box.

            // Setup a starting mini box.
            resizeType = 'mini';
            style.left  = mouseDownPoint.x + 'px';
            style.top   = mouseDownPoint.y + 'px';
            style.width = style.height = 0;
            map.parent.style.cursor = 'crosshair';
        }
        else {
            // Set the indicators of which edges the user is dragging.
            var onEdge = whichBoxEdges(mouseDownPoint);
                onWestEdge  = onEdge.west;
                onEastEdge  = onEdge.east;
                onNorthEdge = onEdge.north;
                onSouthEdge = onEdge.south;

            if (onWestEdge || onEastEdge || onNorthEdge || onSouthEdge) {
                // User clicked on the edge of the box and wants to resize the box.
                prepForResize(mouseDownPoint);
            }
            else if (insideBox(mouseDownPoint)) {
                // User clicked inside the box and wants to move the box.
                clickedInsideBox = true;
            }
            else { // User clicked outside of the box and wants to move the map.
                // Return without cancelling events since map move handling is in another event.
                return;
            }
        }

        addEvent(document, 'mousemove', mouseMove);
        addEvent(document, 'mouseup', mouseUp);
        return MM.cancelEvent(e);
    }

    // User clicked outside of the box on the map.
    function mouseDownMap(e) {
        if (logFunctions) { console.log("boxselector.mouseDownMap..."); }
        return mouseDown(e);
    }

    // User clicked inside of the box on the map.
    function mouseDownBox(e) {
        if (logFunctions) { console.log("boxselector.mouseDownBox..."); }
        return mouseDown(e);
    }

    // When mouse is down, and resizing box...
    function mouseMove(e) {
        if (logFunctions) { console.log("boxselector.mouseMove..."); }

        // Get the current mouse pointer location.
        var point = getMousePoint(e);

        style.display = 'block';
        
        // If the user is starting a new box and it is (so far) still too small to draw normally
        // with aspect locking, etc. (since we do not yet know which way they are going to drag).
        if (drawNewBox && resizeType == 'mini') {
            // Calculate the box width and height.
            var width  = Math.abs(point.x - mouseDownPoint.x),
                height = Math.abs(point.y - mouseDownPoint.y);

            if (width <= (edge * 5) || height <= (edge * 5)) {
                // The box is still to small in at least on dimension and it would confuse the 
                // normal resizing. So, let them do free drawing of the box (assuming that they 
                // are dragging a corner) until it gets bigger.

                // Calculate the box variables.
                var left   = (point.x < mouseDownPoint.x) ? point.x : mouseDownPoint.x,
                    top    = (point.y < mouseDownPoint.y) ? point.y : mouseDownPoint.y,
                    width  = Math.abs(point.x - mouseDownPoint.x),
                    height = Math.abs(point.y - mouseDownPoint.y);

                // Set the style variables with room for borders and formatting.
                style.left   = left + 'px';
                style.top    = top  + 'px';
                style.width  = width  - (2 * borderWidth) + 'px';
                style.height = height - (2 * borderWidth) + 'px';
                return MM.cancelEvent(e);
            }
            else {
                // The box is now big enough to figure out what corner they are dragging (since they
                // have started dragging in a known direction). So, switch to normal box resizing.
                drawNewBox = false;

                // Set the indicators of which edges the user is dragging. Have to do this based
                // on the closes corner since the user is in the process of dragging. If they are 
                // dragging the mini box very quickly, they can get beyond the "edge" distance
                // threshold and the normal whichBoxEdges function will not work.
                var onEdge = whichBoxEdgesBasedOnClosestCorner(point);
                    onWestEdge  = onEdge.west;
                    onEastEdge  = onEdge.east;
                    onNorthEdge = onEdge.north;
                    onSouthEdge = onEdge.south;

                // Switch to normal resizing of boxes.
                prepForResize(point);

                // Update the cursor.
                mouseDownCursor = null;
                changeCursor(point, map.parent);
            }
        }

        if (resizeType == 'normal') { // They are resizing the box.
            var newWest   = 0,
                newEast   = 0,
                newNorth  = 0,
                newSouth  = 0,
                newWidth  = 0,
                newHeight = 0,
                aspect    = aspectRatio();

            // Determine the boxEdges and calculate width/height based on what is being dragged.
            // Only use the mouse point for the new edge location if they have not tried to drag
            // the box edge past the opposite box edge.
            if (onWestEdge) {
                newWest   = (point.x < boxEast) ? point.x  : (boxEast - edge);
                newWidth  = boxEast  - newWest;
            }
            if (onEastEdge) {
                newEast   = (boxWest < point.x) ? point.x  : (boxWest + edge);
                newWidth  = newEast  - boxWest;
            }
            if (onNorthEdge) {
                newNorth  = (point.y < boxSouth) ? point.y : (boxSouth - edge);
                newHeight = boxSouth - newNorth;
            }
            if (onSouthEdge) {
                newSouth  = (boxNorth < point.y) ? point.y : (boxNorth + edge);
                newHeight = newSouth - boxNorth;
            }

            // Calculate other edges and width/height to keep the aspect ratio locked
            // (the calculate variables will only be non-zero if aspect is locked).
            if (calculateWestEdge  || calculateEastEdge)  newWidth = newHeight * aspect;
            if (calculateNorthEdge || calculateSouthEdge) newHeight = newWidth / aspect;
            if (calculateWestEdge)  newWest  = boxEast  - newWidth;
            if (calculateNorthEdge) newNorth = boxSouth - newHeight;

            // Set the style variables with room for borders and formatting.
            if (newWest)   style.left   = newWest   + 'px';
            if (newNorth)  style.top    = newNorth  + 'px';
            if (newWidth)  style.width  = newWidth  - (2 * borderWidth) + 'px';
            if (newHeight) style.height = newHeight - (2 * borderWidth) + 'px';
        }
        else if (clickedInsideBox) { // Move the box.
            // Figure out how far it was moved.
            var delta_x  = point.x - mouseDownPoint.x;
            var delta_y  = point.y - mouseDownPoint.y;
            // Add the distance moved to the box location.
            style.left   = parseFloat(style.left.slice(0,-2))   + delta_x + 'px';
            style.right  = parseFloat(style.right.slice(0,-2))  - delta_x + 'px';
            style.top    = parseFloat(style.top.slice(0,-2))    + delta_y + 'px';
            style.bottom = parseFloat(style.bottom.slice(0,-2)) - delta_y + 'px';
            mouseDownPoint = point; //reset starting point to calculate next delta
        }

        changeCursor(point, map.parent);
        return MM.cancelEvent(e);
    }

    function mouseUp(e) {
        if (logFunctions) { console.log("boxselector.mouseUp..."); }

        var point = getMousePoint(e);

        // Update the final box extent.
        var west  = parseInt(boxDiv.offsetLeft, 10),
            east  = west + parseInt(boxDiv.offsetWidth, 10),
            north = parseInt(boxDiv.offsetTop, 10),
            south = north + parseInt(boxDiv.offsetHeight, 10),
            TL    = map.pointLocation(new MM.Point(west, north)),
            BR    = map.pointLocation(new MM.Point(east, south));
        boxselector.extent([
            new MM.Location(
                Math.max(TL.lat, BR.lat),
                Math.min(TL.lon, BR.lon)),
            new MM.Location(
                Math.min(TL.lat, BR.lat),
                Math.max(TL.lon, BR.lon))
        ]);

        // Initialize original mouse click location and cursor style.
        mouseDownPoint = mouseDownCursor = null;
        // Initialize variables that indicate user intention.
        drawNewBox = clickedInsideBox = false;
        resizeType = null;
        // Initialize resizing variables.
        boxWest = boxEast = boxNorth = boxSouth = 0;
        onWestEdge = onEastEdge = onNorthEdge = onSouthEdge = false;
        calculateNorthEdge = calculateSouthEdge = calculateWestEdge = calculateEastEdge = false;

        removeEvent(document, 'mousemove', mouseMove);
        removeEvent(document, 'mouseup', mouseUp);
        map.parent.style.cursor = 'auto';
    }

    function mouseMoveCursor(e) {
        //if (logFunctions) { console.log("boxselector.mouseMoveCursor..."); }
        changeCursor(getMousePoint(e), boxDiv);
    }

    // Set resize cursor if mouse is on edge
    function changeCursor(point, elem) {
        //if (logFunctions) { console.log("boxselector.changeCursor..."); }

        // If the cursor is outside of the box let the default cursor handling take care of it.
        if (outsideBox(point)) return;

        if (insideBox(point)) {
            elem.style.cursor = 'pointer';
            return;
        }

        // Determine the box edges.
        var west   = parseInt(boxDiv.offsetLeft, 10),
            east   = west + parseInt(boxDiv.offsetWidth, 10),
            north  = parseInt(boxDiv.offsetTop, 10),
            south  = north + parseInt(boxDiv.offsetHeight, 10);

        // Build cursor style string
        var prefix = '',
        tempPrefix = null;
        if (point.y - north <= edge) prefix = 'n'; // The cursor is near the north side of the box.
        if (south - point.y <= edge) prefix = 's'; // The cursor is near the south side of the box.
        if (point.x - west  <= edge) tempPrefix = 'w'; // The cursor is near the west side of the box.
        if (east - point.x  <= edge) tempPrefix = 'e'; // The cursor is near the east side of the box.
        if (tempPrefix) { // If the cursor is near the west side of the box.
            if (prefix != '' && aspectLocked()) { // The cursor is near a corner and aspect is locked.
                // The east/west sides should be dominant. So, replace the n/s with a w. 
                // Otherwise, leave the n|s that is already there.
                if (!northSouthDominant) prefix = tempPrefix;
            }
            else prefix += tempPrefix; // Add to blank or n|s (if aspect not locked).
        }
        if (prefix !== '') prefix += '-resize';

        // If the user is dragging something, save their cursor style.
        if (mouseDownPoint) mouseDownCursor = prefix;

        // Set the cursor.
        elem.style.cursor = prefix;
    }

    function drawbox(map, e) {
        //if (logFunctions) { console.log("boxselector.drawbox..."); }

        if (!boxDiv || !box) return;
        var br = map.locationPoint(box[1]),
            tl = map.locationPoint(box[0]),
            style = boxDiv.style;
        //console.log("drawbox before: [br:",br,"] [tl:",tl,"]");

        style.display = 'block';
        style.height = 'auto';
        style.width = 'auto';
        style.left = Math.max(0, tl.x) + 'px';
        style.top = Math.max(0, tl.y) + 'px';
        style.right = Math.max(0, map.dimensions.x - br.x) + 'px';
        style.bottom = Math.max(0, map.dimensions.y - br.y) + 'px';
        //console.log("drawbox after: [left:",style.left,"] [top:", style.top,"] [right:", style.right,"] [bottom:",style.bottom,"]");
    }

    boxselector.extent = function(x, silent) {
        //if (logFunctions) { console.log("boxselector.extent..."); }

        if (!x) return box;

        box = [
            new MM.Location(
                Math.max(x[0].lat, x[1].lat),
                Math.min(x[0].lon, x[1].lon)),
            new MM.Location(
                Math.min(x[0].lat, x[1].lat),
                Math.max(x[0].lon, x[1].lon))
        ];
        //console.log("extent: [box:",box,"]");

        drawbox(map);

        if (!silent) callback(box);
    };

    boxselector.getboxdiv = function()
    {
        //if (logFunctions) { console.log("boxselector.getboxdiv..."); }
        return boxDiv;
    }

    boxselector.add = function(map) {
        if (logFunctions) { console.log("boxselector.add..."); }

        boxDiv = boxDiv || document.createElement('div');
        boxDiv.id = map.parent.id + '-boxselector-box';
        boxDiv.className = 'boxselector-box';
        map.parent.appendChild(boxDiv);
        style = boxDiv.style;
        borderWidth = parseInt(window.getComputedStyle(boxDiv).borderWidth, 10);

        addEvent(map.parent, 'mousedown', mouseDownMap);
        addEvent(boxDiv, 'mousedown', mouseDownBox);
        addEvent(map.parent, 'mousemove', mouseMoveCursor);
        map.addCallback('drawn', drawbox);
        return this;
    };

    boxselector.remove = function() {
        if (logFunctions) { console.log("boxselector.remove..."); }

        map.parent.removeChild(boxDiv);
        removeEvent(map.parent, 'mousedown', mouseDownMap);
        removeEvent(boxDiv, 'mousedown', mouseDownBox);
        removeEvent(map.parent, 'mousemove', mouseMoveCursor);
        map.removeCallback('drawn', drawbox);
    };

    // Returns x & y distances (meters) between start and end locations
    // Replaces MM.location.distance(), as that isn't accurate enough
    // See [Formula and code for calculating distance based on two lat/lon locations](http://www.csgnetwork.com/degreelenllavcalc.html)
    boxselector.distances = function(l1, l2) {
        var deg2rad = Math.PI / 180.0,
            m1 = 111132.92,
            m2 = -559.82,
            m3 = 1.175,
            m4 = -0.0023,
            p1 = 111412.84,
            p2 = -93.5,
            p3 = 0.118,
            latRad = (l1.lat + l2.lat)*deg2rad/2, //use average position between latitudes 
            latDeg = m1 + (m2*Math.cos(2*latRad))+(m3*Math.cos(4*latRad))+(m4*Math.cos(6*latRad)),
            lonDeg = (p1*Math.cos(latRad))+(p2*Math.cos(3*latRad))+(p3*Math.cos(4*latRad)),
            lonDistance = (l2.lon - l1.lon) * lonDeg,
            latDistance = (l1.lat - l2.lat) * latDeg,
            distances = {x: lonDistance, y: latDistance};

        return distances;
    }

    return boxselector.add(map);
};
