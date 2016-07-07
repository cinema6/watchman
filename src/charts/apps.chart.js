'use strict';

module.exports = data => {
    return {
        type: 'line',
        data: {
            labels: data.labels,
            datasets: [
                {
                    label: 'CTR',
                    data: data.ctrs,
                    fill: false,
                    backgroundColor: 'rgba(250, 169, 22,1)',
                    borderColor: 'rgba(250, 169, 22,1)',
                    pointBorderColor: 'rgba(250, 169, 22,1)',
                    pointBackgroundColor: 'rgba(250, 169, 22,1)',
                    lineTension: 0.1,
                    pointRadius: 0,
                    yAxisID: 'ctr'
                },
                {
                    label: 'Industry CTR',
                    data: data.items.map(() => data.industryCTR),
                    fill: false,
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    borderColor: 'rgba(0, 0, 0, 0.5)',
                    lineTension: 0.1,
                    pointRadius: 0,
                    yAxisID: 'ctr'
                },
                {
                    label: 'Unique Views',
                    data: data.users,
                    fill: true,
                    backgroundColor: 'rgba(38, 173, 228,0.15)',
                    borderColor: 'rgba(38, 173, 228,1)',
                    pointBorderColor: 'rgba(38, 173, 228,1)',
                    pointBackgroundColor: 'rgba(38, 173, 228,1)',
                    lineTension: 0.1,
                    yAxisID: 'users'
                }
            ]
        },
        options: {
            legend: {
                position: 'bottom'
            },
            borderWidth: 2,

            stacked: true,
            scales: {
                xAxes: [
                    {
                        display: true,
                        gridLines: {
                            offsetGridLines: false
                        },
                        ticks: {
                            callback: (date, index, dates) => {
                                const is30Day = dates.length > 7;

                                if (is30Day) {
                                    return (index % 2 === 0) ?
                                        date.format('M/D') : ' ';
                                } else {
                                    return date.format('M/D');
                                }
                            },
                            autoSkip: true,
                            maxRotation: 0
                        }
                    }
                ],
                yAxes: [
                    {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        id: 'users',

                        ticks: {
                            suggestedMin: 25
                        }
                    },
                    {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        id: 'ctr',

                        gridLines: {
                            drawOnChartArea: false
                        },
                        ticks: {
                            callback: value => `${value}%`,
                            suggestedMin: 0,
                            suggestedMax: 20
                        }
                    }
                ]
            }
        }
    };
};
