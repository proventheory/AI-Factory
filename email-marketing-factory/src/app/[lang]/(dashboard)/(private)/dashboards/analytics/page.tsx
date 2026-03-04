// MUI Imports
import Grid from '@mui/material/Grid'

// Components Imports
import Congratulations from '@views/dashboards/analytics/Congratulations'
import LineAreaOrderChart from '@views/dashboards/analytics/LineAreaOrderChart'
import Vertical from '@components/card-statistics/Vertical'
import TotalRevenueReport from '@views/dashboards/analytics/TotalRevenueReport'
import BarRevenueChart from '@views/dashboards/analytics/BarRevenueChart'
import LineProfitReportChart from '@views/dashboards/analytics/LineProfitReportChart'
import OrderStatistics from '@views/dashboards/analytics/OrderStatistics'
import FinancialStatsTabs from '@views/dashboards/analytics/FinancialStatsTabs'
import Transactions from '@views/dashboards/analytics/Transactions'
import ActivityTimeline from '@views/dashboards/analytics/ActivityTimeline'
import TableWithTabs from '@views/dashboards/analytics/TableWithTabs'

const DashboardAnalytics = () => {
  return (
    <Grid container spacing={6}>
      <Grid item xs={12}>
        <Grid container spacing={6}>
          <Grid item xs={12} lg={8}>
            <Congratulations />
          </Grid>
          <Grid item xs={12} sm={6} lg={2}>
            <LineAreaOrderChart />
          </Grid>
          <Grid item xs={12} sm={6} lg={2}>
            <Vertical
              title='Sales'
              imageSrc='/images/cards/wallet-info-bg.png'
              stats='$4,679'
              trendNumber={28.14}
              trend='positive'
            />
          </Grid>
          <Grid item xs={12} lg={8} order={{ xs: 2, lg: 1 }}>
            <TotalRevenueReport />
          </Grid>
          <Grid item xs={12} sm={12} lg={4} order={{ xs: 1, lg: 2 }}>
            <Grid container spacing={6}>
              <Grid item xs={12} sm={6} md={4} lg={6}>
                <Vertical
                  title='Payments'
                  imageSrc='/images/cards/paypal-error-bg.png'
                  stats='$2,468'
                  trendNumber={14.82}
                  trend='negative'
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4} lg={6}>
                <BarRevenueChart />
              </Grid>
              <Grid item xs={12} md={4} lg={12}>
                <LineProfitReportChart />
              </Grid>
            </Grid>
          </Grid>
        </Grid>
      </Grid>
      <Grid item xs={12} md={4}>
        <OrderStatistics />
      </Grid>
      <Grid item xs={12} md={4}>
        <FinancialStatsTabs />
      </Grid>
      <Grid item xs={12} md={4}>
        <Transactions />
      </Grid>
      <Grid item xs={12} md={6}>
        <ActivityTimeline />
      </Grid>
      <Grid item xs={12} md={6}>
        <TableWithTabs />
      </Grid>
    </Grid>
  )
}

export default DashboardAnalytics
