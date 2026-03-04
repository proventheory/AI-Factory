// MUI Imports
import Grid from '@mui/material/Grid'

// Components Imports
import Award from '@views/apps/ecommerce/dashboard/Award'
import NewVisitorsAndActivityCharts from '@views/apps/ecommerce/dashboard/NewVisitorsAndActivityCharts'
import Vertical from '@components/card-statistics/Vertical'
import BarProfitChart from '@views/apps/ecommerce/dashboard/BarProfitChart'
import RadialExpensesChart from '@views/apps/ecommerce/dashboard/RadialExpensesChart'
import TotalIncome from '@views/apps/ecommerce/dashboard/TotalIncome'
import Performance from '@views/apps/ecommerce/dashboard//Performance'
import ConversionRate from '@views/apps/ecommerce/dashboard/ConversionRate'
import SalesInfoCard from '@views/apps/ecommerce/dashboard/SalesInfoCard'
import BarExpensesChart from '@views/apps/ecommerce/dashboard/BarExpensesChart'
import TotalBalance from '@views/apps/ecommerce/dashboard/TotalBalance'
import CustomersTable from '@views/apps/ecommerce/dashboard/CustomersTable'

const EcommerceDashboard = () => {
  return (
    <Grid container spacing={6}>
      <Grid item xs={12} md={4}>
        <Award />
      </Grid>
      <Grid item xs={12} md={8}>
        <NewVisitorsAndActivityCharts />
      </Grid>
      <Grid item xs={12} sm={12} lg={4}>
        <Grid container spacing={6}>
          <Grid item xs={12} sm={6} md={3} lg={6}>
            <Vertical
              title='Sales'
              imageSrc='/images/cards/wallet-info-bg.png'
              stats='$4,679'
              trendNumber={28.14}
              trend='positive'
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3} lg={6}>
            <BarProfitChart />
          </Grid>
          <Grid item xs={12} sm={6} md={3} lg={6}>
            <RadialExpensesChart />
          </Grid>
          <Grid item xs={12} sm={6} md={3} lg={6}>
            <Vertical
              title='Transactions'
              imageSrc='/images/cards/credit-card-primary-bg.png'
              stats='$14,854'
              trendNumber={62}
              trend='positive'
            />
          </Grid>
        </Grid>
      </Grid>
      <Grid item xs={12} lg={8}>
        <TotalIncome />
      </Grid>
      <Grid item xs={12} md={6} lg={4}>
        <Performance />
      </Grid>
      <Grid item xs={12} md={6} lg={4}>
        <ConversionRate />
      </Grid>
      <Grid item xs={12} sm={12} lg={4}>
        <Grid container spacing={6}>
          <Grid item xs={12} sm={6} md={3} lg={6}>
            <Vertical
              title='Revenue'
              imageSrc='/images/cards/mac-warning-bg.png'
              stats='$42,389'
              trendNumber={52.18}
              trend='positive'
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3} lg={6}>
            <SalesInfoCard />
          </Grid>
          <Grid item xs={12} md={6} lg={12}>
            <BarExpensesChart />
          </Grid>
        </Grid>
      </Grid>
      <Grid item xs={12} lg={8}>
        <CustomersTable />
      </Grid>
      <Grid item xs={12} lg={4}>
        <TotalBalance />
      </Grid>
    </Grid>
  )
}

export default EcommerceDashboard
