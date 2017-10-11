// ==UserScript==
// @name                tpb-top-imdb
// @namespace           uncleinf
// @version             0.9
// @description         Loads imdb rating info for top100 search results
// @author              UncleInf
// @license             MIT
// @supportURL          https://github.com/UncleInf/tpb-top-imdb
// @contributionURL     https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=HYV6Z2N9BA5V8
// @contributionAmount  5
// @require             https://code.jquery.com/jquery-3.2.1.min.js
// @require             https://cdnjs.cloudflare.com/ajax/libs/store2/2.5.7/store2.min.js
// @include             http*://thepiratebay.*/top/207
// @include             http*://thepiratebay.*/top/201
// @include             http*://thepiratebay.*/top/202
// @include             http*://thepiratebay.*/top/205
// @include             http*://thepiratebay.*/top/208
// @include             http*://thepiratebay.*/top/209
// @grant               GM_xmlhttpRequest
// @connect             theimdbapi.org
// ==/UserScript==

/*
todo

1. each row return defered successful when done getting imdbid, before calling external api
    this is hard-ish. imdb id is in store url object or deeper in calling stack. need to refactor
2. add ids to toggle buttons
3. do filtering at each row
*/

(function () {
    'use strict';
    /* global $, store */

    $(function () {
        addHeader();
        addOptions();
        refreshRatings();
    });

    function addHeader() {
        var header = $('<th>').attr('title', '6.5 - 7.2 - 8'),
            a = $('<a>').attr('href', '#').text('Rating').click(refreshRatingsData);

        header.append(a);
        $('th').parent().prepend(header);
    }

    function addOptions() {
        var buttonGetData = function(name) {
            var storeData = store.get(name);
            return storeData === undefined ? true : storeData;
        };

        var dublicatesButton = {
            text: ' dublicates',
            initData: function() {
                return buttonGetData('dublicates');
            },
            persistData: function(value) {
                store.set('dublicates', value);
            }
        };

        var noInfoButton = {
            text: ' no info',
            initData: function() {
                return buttonGetData('noInfo');
            },
            persistData: function(value) {
                store.set('noInfo', value);
            }
        };

        var optionsCell = $('<td>')
            .attr('colspan', $('th').length)
            .append(
                getToggle(dublicatesButton),
                ' / ',
                getToggle(noInfoButton),
                ' / ',
                $('<span>').attr('id', 'filteredCount')
            );

        $('tbody').prepend($('<tr>').append(optionsCell));
    }

    function getToggle(button) {
        var getButtonData = function(element, key) {
            return !!element.data(key);
        };

        var getButtonText = function(element, data) {
            var getState = function(data) {
                return data ? 'Hide' : 'Show';
            };

            return getState(data === undefined ? getButtonData(element, 'shown') : data) + button.text;
        };

        var onChange = function() {
            var element = $(this);

            element.text(getButtonText(element));
            refreshRatings();
        };

        var onClick = function(e) {
            e.preventDefault();

            var element = $(this),
                changedData = !getButtonData(element, 'shown');

            element.data('shown', changedData).trigger('changeData');
            button.persistData(changedData);
        };

        var buttonInitData = button.initData();

        return $('<a>').attr('href', '#')
            .click(onClick)
            .on('changeData', onChange)
            .data('shown', buttonInitData)
            .text(getButtonText(null, buttonInitData));
    }

    function updateCount() {
        var extraLines = 2; //th, options row
        $('#filteredCount').text($('tr').length - extraLines);

        console.log('update count');
    }

    function clearCount() {
        $('#filteredCount').text('--');
    }

    function refreshRatingsData(e) {
        e.preventDefault();

        clearData();
        refreshRatings();
    }

    function refreshRatings() {
        var actions = [];

        clearCount();
        $('tr').each(function() {
            addRating($(this), actions);
        });
        $.when.apply($, actions).done(updateCount);
    }

    function clearData() {
        var ratingCells = $('.tpb-top-imdb');

        ratingCells.find('a').text('');
        ratingCells.attr('style', '');

        store.clearAll();
    }

    function addRating(row, actions) {
        // var row = $(this),
        var link = row.find('.detLink').attr('href');

        //there is no link - it is not downloadable coontent (th)
        if (!link) {
            return;
        }

        var elements = findElements(row),
            td = elements.td,
            center = elements.center,
            deferred = new $.Deferred();
        
        getData(link)
            .then(function (data) {
                deferred.resolve();
                displayRating(data, td, center);
            })
            .fail(function (error) {
                deferred.reject();
                badData(error, center);
            });

        actions.push(deferred);
        return deferred.promise(); 
    }

    function findElements(row) {
        var td = row.find('.tpb-top-imdb'),
            center;

        if (td.length > 0) {
            center = td.find('center');
        } else {
            td = $('<td>').addClass('vertTh tpb-top-imdb');
            center = $('<center>');
            row.prepend(td.append(center));
        }

        return {
            td: td,
            center: center
        };
    }

    function getData(link) {
        var deferred = new $.Deferred(),
            linkId = parseLinkId(link);

        if (!linkId) {
            console.log('Couldnt get linkId in url');
            deferred.reject(iDontKnow());
        }

        if (store.has(linkId)) {
            deferred.resolve(store.get(linkId));
        } else {
            getAndSaveNewData(link, linkId)
                .done(function () {
                    deferred.resolve(store.get(linkId));
                })
                .fail(deferred.reject);
        }

        return deferred.promise();
    }

    function parseLinkId(link) {
        var split = link.split('/');
        return split && split.length >= 3 ? split[2] : null;
    }

    function getAndSaveNewData(link, linkId) {
        return $.get(link)
            .then(extractImdbId)
            .then(getImdbData)
            .then(function (data) {
                persistData(data, linkId);
            });
    }

    function extractImdbId(resp) {
        var deferred = new $.Deferred();

        var regexp = 'www.imdb.com/title/(.*)/"',
            regexFind = resp.match(regexp),
            id = regexFind && regexFind.length === 2 ? regexFind[1] : null;

        if (id) {
            deferred.resolve(id);
        } else {
            // console.log('Could not parse IMDB id');
            deferred.reject(iDontKnow());
        }

        return deferred.promise();
    }

    function getImdbData(imdbId) {
        var deferred = new $.Deferred();

        var apiUrl = 'https://theimdbapi.org/api/movie?movie_id=' + imdbId;
        $.getJSON(apiUrl)
            .done(function (resp) {
                var data = {
                    url: resp.url.url,
                    rating: Number.parseFloat(resp.rating),
                    ratingCount: resp.rating_count
                };
                deferred.resolve(data);
            })
            .fail(function () {
                deferred.reject(iDontKnow());
            });

        return deferred.promise();
    }

    function persistData(data, id) {
        store.set(id, data);
        return $.when();
    }

    function displayRating(data, td, center) {
        var a = center.find('a');

        if (a.length === 0) {
            a = $('<a>').text(data.rating).attr('href', data.url);
            center.append(a);
        } else {
            a.text(data.rating);
        }

        td.css(getRatingStyles(data.rating));
        td.attr('title', data.ratingCount);
    }

    function badData(message, element) {
        element.text(message);
    }

    function getRatingStyles(rating) {
        var colour = '';

        if (rating >= 8) {
            colour = 'palegreen';
        } else if (rating >= 7.2) {
            colour = 'powderblue';
        } else if (rating >= 6.5) {
            colour = 'lightcyan';
        }

        return {
            'background-color': colour
        };
    }

    function iDontKnow() {
        // return '¯\\_(ツ)_/¯';
        return '--';
    }
})();