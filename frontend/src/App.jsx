import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import AlertsTable from './pages/AlertsTable'
import LockedAccounts from './pages/LockedAccounts'
import IpInvestigation from './pages/IpInvestigation'
import MeasurementsExport from './pages/MeasurementsExport'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="alerts" element={<AlertsTable />} />
        <Route path="locked-accounts" element={<LockedAccounts />} />
        <Route path="ip-investigation" element={<IpInvestigation />} />
        <Route path="measurements" element={<MeasurementsExport />} />
      </Route>
    </Routes>
  )
}
