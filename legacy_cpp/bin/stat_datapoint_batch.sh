for dir in `aws s3api list-objects --bucket otmc --prefix "$1/" --delimiter "/" | jq -r '.CommonPrefixes[].Prefix'`; do
    echo ${dir%/}
    ./stat_datapoint.py ${dir%/}
    suffix=${dir##*cutoff/}
    aws s3 cp s3://otmc/${dir}stat/output/ . --recursive --exclude '*' --include 'datapoint_*.csv' 
    rename .csv _${suffix%/}.csv ./datapoint_*.csv
    aws s3 cp . s3://otmc/$1/results --recursive --exclude '*' --include 'datapoint_*.csv' 
    rm ./datapoint_*.csv
done