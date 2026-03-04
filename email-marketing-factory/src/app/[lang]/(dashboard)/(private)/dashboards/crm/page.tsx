// MUI Imports
import Grid from '@mui/material/Grid'

// Components Imports
import CustomerRatings from '@views/dashboards/crm/CustomerRatings'
import OverviewSalesActivity from '@views/dashboards/crm/OverviewSalesActivity'
import LineAreaSessionsChart from '@views/dashboards/crm/LineAreaSessionsChart'
import Vertical from '@components/card-statistics/Vertical'
import DonutChartGeneratedLeads from '@views/dashboards/crm/DonutChartGeneratedLeads'
import TopProducts from '@views/dashboards/crm/TopProducts'
import EarningReports from '@views/dashboards/crm/EarningReports'
import SalesAnalytics from '@views/dashboards/crm/SalesAnalytics'
import SalesByCountries from '@views/dashboards/crm/SalesByCountries'
import SalesStats from '@views/dashboards/crm/SalesStats'
import TeamMembers from '@views/dashboards/crm/TeamMembers'
import CustomersTable from '@views/dashboards/crm/CustomersTable'

const DashboardCRM = () => {
  return (
    <Grid container spacing={6}>
      <Grid item xs={12} md={6} xl={4}>
        <CustomerRatings />
      </Grid>
      <Grid item xs={12} md={6} xl={4}>
        <OverviewSalesActivity />
      </Grid>
      <Grid item xs={12} sm={12} lg={4}>
        <Grid container spacing={6}>
          <Grid item xs={12} sm={6} md={3} lg={6}>
            <LineAreaSessionsChart />
          </Grid>
          <Grid item xs={12} sm={6} md={3} lg={6}>
            <Vertical
              title='order'
              imageSrc='/images/cards/cube-secondary-bg.png'
              stats='$1,286'
              trendNumber={13.24}
              trend='negative'
            />
          </Grid>
          <Grid item xs={12} md={6} lg={12}>
            <DonutChartGeneratedLeads />
          </Grid>
        </Grid>
      </Grid>
      <Grid item xs={12} lg={8}>
        <TopProducts />
      </Grid>
      <Grid item xs={12} md={6} xl={4}>
        <EarningReports />
      </Grid>
      <Grid item xs={12} md={6} xl={4}>
        <SalesAnalytics />
      </Grid>
      <Grid item xs={12} md={6} xl={4}>
        <SalesByCountries />
      </Grid>
      <Grid item xs={12} md={6} xl={4}>
        <SalesStats />
      </Grid>
      <Grid item xs={12} xl={5}>
        <TeamMembers />
      </Grid>
      <Grid item xs={12} xl={7}>
        <CustomersTable />
      </Grid>
    </Grid>
  )
}

export default DashboardCRM
