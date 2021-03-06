import {ref} from 'objection';
import {IndexablePage} from '@panderalabs/koa-pageable';
import {Event, AppealHistory} from '../models';
import {normalize, formatDateTime} from '../lib/utils';


/**
 * Get the events
 * @param ctx
 */
export const get = async (ctx) => {

    const filterMapping = {
        id: 'e.id',
        location: 'e.location',
        vehicle: [
            'vehicle.plate',
            'vehicle.model'
        ]
    };

    // TODO
    const pageNumber = ctx.state.pageable.page || 0;
    const pageSize = ctx.state.pageable.size || 10;
    // const sort = ctx.state.pageable.sort;

    const filter = Object.entries(ctx.request.query)
        .filter(([k, v]) => Object.keys(filterMapping).includes(k));


    const {results, total} = await Event.query()
        .alias('e')
        .select('e.*')
        .select('ah.historyCount')
        .select('ebv.eventCount')
        .eager('vehicle')

        .leftJoin(
            AppealHistory.query()
                .alias('ah')
                .select('eventId')
                .count('id as historyCount')
                // .whereIn('ah.eventId', 'parent:id')
                .groupBy('ah.eventId')
                .as('ah'),
            'ah.eventId',
            'e.id'
        )

        .leftJoin(
            Event.query()
                .alias('ebv')
                .select('vehicleId')
                .count('id as eventCount')
                .groupBy('ebv.vehicleId')
                .as('ebv'),
            'e.vehicleId',
            'ebv.vehicleId'
        )

        .where((builder) =>
            filter.forEach(([k, v]) => {
                const keys = filterMapping[k];
                if (keys.constructor === Array) {
                    let result;
                    keys.forEach(key => {
                        result = !result ?
                            builder.where(key, 'like', `%${v}%`)
                            : result.orWhere(key, 'like', `%${v}%`);
                    });
                } else {
                    builder.where(keys, 'like', `%${v}%`);
                }
            })
        )
        .orderBy('id', 'desc')
        .page(pageNumber, pageSize);


    const events = results.map((event) => ({
        ...event,
        datetime: formatDateTime(event.datetime),
        appealHistory: event.appealHistory ? event.appealHistory.map((item) => ({...item, datetime: formatDateTime(item.datetime)})) : [],
        statusCheckUrl: process.env.STATUS_CHECK_URL ? `${process.env.STATUS_CHECK_URL}${event.foreignId}` : event.foreignId
    }));

    const result = new IndexablePage(normalize(events), total, ctx.state.pageable);

    ctx.ok(result);
};
