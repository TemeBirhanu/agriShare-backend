import express from "express";
import pkg from "pdf-lib";
const { PDFDocument, StandardFonts, rgb } = pkg;

const router = express.Router();

router.post("/generate-pdf", async (req, res) => {
  try {
    const investment = req.body;

    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();

    // Add a page (A4 size)
    const page = pdfDoc.addPage([595, 842]); // A4 dimensions

    // Embed fonts
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

    // Colors
    const primaryColor = rgb(0.2, 0.4, 0.2); // Dark green
    const secondaryColor = rgb(0.4, 0.4, 0.4); // Gray
    const borderColor = rgb(0.8, 0.8, 0.8);
    const textColor = rgb(0.1, 0.1, 0.1);

    let y = 800;
    const leftMargin = 50;
    const rightColumn = 350;

    // Helper function to draw a line
    const drawLine = (startY, thickness = 1, color = borderColor) => {
      page.drawLine({
        start: { x: leftMargin, y: startY },
        end: { x: 545, y: startY },
        thickness: thickness,
        color: color,
      });
    };

    // Helper function to add field
    const addField = (label, value, yPos) => {
      page.drawText(label, {
        x: leftMargin,
        y: yPos,
        size: 10,
        font: fontBold,
        color: primaryColor,
      });

      const displayValue =
        value && value !== "null" && value !== "undefined"
          ? String(value)
          : "—";

      page.drawText(displayValue, {
        x: leftMargin + 140,
        y: yPos,
        size: 10,
        font: font,
        color: textColor,
        maxWidth: 280,
      });
    };

    // Header Section
    // Company Logo/Name
    page.drawText("AGRI-SHARE", {
      x: leftMargin,
      y: y,
      size: 24,
      font: fontBold,
      color: primaryColor,
    });

    page.drawText("Agricultural Investment Platform", {
      x: leftMargin,
      y: y - 18,
      size: 10,
      font: font,
      color: secondaryColor,
    });

    // Contract Badge
    page.drawRectangle({
      x: 450,
      y: y - 10,
      width: 140,
      height: 30,
      borderColor: primaryColor,
      borderWidth: 1,
    });

    page.drawText("CONTRACT", {
      x: 478,
      y: y - 2,
      size: 14,
      font: fontBold,
      color: primaryColor,
    });

    y -= 60;

    // Divider
    drawLine(y);
    y -= 20;

    // Contract Title
    page.drawText("INVESTMENT CONTRACT AGREEMENT", {
      x: leftMargin,
      y: y,
      size: 16,
      font: fontBold,
      color: primaryColor,
    });

    y -= 25;

    // Contract Number
    page.drawText(`Contract No: ${investment.contractNumber || "N/A"}`, {
      x: leftMargin,
      y: y,
      size: 11,
      font: fontOblique,
      color: secondaryColor,
    });

    y -= 35;

    // Parties Section
    page.drawText("PARTIES TO THE AGREEMENT", {
      x: leftMargin,
      y: y,
      size: 12,
      font: fontBold,
      color: primaryColor,
    });

    y -= 20;
    drawLine(y + 5);
    y -= 20;

    // Investor Info
    page.drawText("1. INVESTOR (First Party):", {
      x: leftMargin,
      y: y,
      size: 11,
      font: fontBold,
      color: textColor,
    });
    y -= 18;

    const investorName = investment.investor
      ? `${investment.investor.firstName || ""} ${investment.investor.lastName || ""}`.trim()
      : "N/A";
    page.drawText(`Name: ${investorName}`, {
      x: leftMargin + 20,
      y: y,
      size: 10,
      font: font,
      color: textColor,
    });
    y -= 16;

    page.drawText(`Investor ID: ${investment.investor?._id || "N/A"}`, {
      x: leftMargin + 20,
      y: y,
      size: 10,
      font: font,
      color: textColor,
    });
    y -= 25;

    // Farmer Info
    page.drawText("2. FARMER (Second Party):", {
      x: leftMargin,
      y: y,
      size: 11,
      font: fontBold,
      color: textColor,
    });
    y -= 18;

    const farmerName = investment.farmer
      ? `${investment.farmer.firstName || ""} ${investment.farmer.lastName || ""}`.trim()
      : "N/A";
    page.drawText(`Name: ${farmerName}`, {
      x: leftMargin + 20,
      y: y,
      size: 10,
      font: font,
      color: textColor,
    });
    y -= 16;

    page.drawText(`Farmer ID: ${investment.farmer?._id || "N/A"}`, {
      x: leftMargin + 20,
      y: y,
      size: 10,
      font: font,
      color: textColor,
    });
    y -= 25;

    // Investment Details Section
    page.drawText("INVESTMENT DETAILS", {
      x: leftMargin,
      y: y,
      size: 12,
      font: fontBold,
      color: primaryColor,
    });

    y -= 20;
    drawLine(y + 5);
    y -= 25;

    // Listing/Pitch
    page.drawText("Investment Opportunity:", {
      x: leftMargin,
      y: y,
      size: 10,
      font: fontBold,
      color: textColor,
    });
    page.drawText(investment.listing?.pitchTitle || "N/A", {
      x: leftMargin + 140,
      y: y,
      size: 10,
      font: font,
      color: textColor,
    });
    y -= 18;

    page.drawText("Listing ID:", {
      x: leftMargin,
      y: y,
      size: 10,
      font: fontBold,
      color: textColor,
    });
    page.drawText(investment.listing?._id || "N/A", {
      x: leftMargin + 140,
      y: y,
      size: 10,
      font: font,
      color: textColor,
    });
    y -= 18;

    page.drawText("Shares Purchased:", {
      x: leftMargin,
      y: y,
      size: 10,
      font: fontBold,
      color: textColor,
    });
    page.drawText(String(investment.sharesPurchased || 0), {
      x: leftMargin + 140,
      y: y,
      size: 10,
      font: font,
      color: textColor,
    });
    y -= 18;

    page.drawText("Amount Paid:", {
      x: leftMargin,
      y: y,
      size: 10,
      font: fontBold,
      color: textColor,
    });
    page.drawText(`${investment.amountPaidBirr || 0} ETB (Ethiopian Birr)`, {
      x: leftMargin + 140,
      y: y,
      size: 10,
      font: fontBold,
      color: primaryColor,
    });
    y -= 25;

    // Status Section
    page.drawText("CONTRACT STATUS", {
      x: leftMargin,
      y: y,
      size: 12,
      font: fontBold,
      color: primaryColor,
    });

    y -= 20;
    drawLine(y + 5);
    y -= 25;

    // Status with color coding
    const status = investment.status || "pending";
    let statusColor = rgb(0.4, 0.4, 0.4);
    if (status === "active") statusColor = rgb(0.2, 0.6, 0.2);
    if (status === "disputed") statusColor = rgb(0.8, 0.4, 0.1);
    if (status === "completed") statusColor = rgb(0.1, 0.5, 0.8);
    if (status === "refunded") statusColor = rgb(0.6, 0.2, 0.2);

    page.drawText("Current Status:", {
      x: leftMargin,
      y: y,
      size: 10,
      font: fontBold,
      color: textColor,
    });
    page.drawText(status.toUpperCase(), {
      x: leftMargin + 140,
      y: y,
      size: 10,
      font: fontBold,
      color: statusColor,
    });
    y -= 18;

    if (status === "disputed" && investment.disputeReason) {
      page.drawText("Dispute Reason:", {
        x: leftMargin,
        y: y,
        size: 10,
        font: fontBold,
        color: textColor,
      });

      const reason = investment.disputeReason.replace(/_/g, " ").toUpperCase();
      page.drawText(reason, {
        x: leftMargin + 140,
        y: y,
        size: 9,
        font: font,
        color: rgb(0.8, 0.3, 0.1),
        maxWidth: 280,
      });
      y -= 18;

      if (investment.disputedAt) {
        page.drawText("Disputed On:", {
          x: leftMargin,
          y: y,
          size: 10,
          font: fontBold,
          color: textColor,
        });
        page.drawText(new Date(investment.disputedAt).toLocaleDateString(), {
          x: leftMargin + 140,
          y: y,
          size: 10,
          font: font,
          color: textColor,
        });
        y -= 18;
      }
    }

    y -= 10;

    // Important Dates Section
    page.drawText("IMPORTANT DATES", {
      x: leftMargin,
      y: y,
      size: 12,
      font: fontBold,
      color: primaryColor,
    });

    y -= 20;
    drawLine(y + 5);
    y -= 25;

    const formatDate = (date) => {
      if (!date) return "—";
      return new Date(date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    };

    addField("Signed Date:", formatDate(investment.signedAt), y);
    y -= 18;
    addField("Created Date:", formatDate(investment.createdAt), y);
    y -= 18;
    addField("Last Updated:", formatDate(investment.updatedAt), y);
    y -= 18;
    addField(
      "Refunded Date:",
      formatDate(investment.refundedAt) === "—"
        ? "Not Refunded"
        : formatDate(investment.refundedAt),
      y,
    );
    y -= 30;

    // Terms & Conditions
    page.drawText("TERMS AND CONDITIONS", {
      x: leftMargin,
      y: y,
      size: 12,
      font: fontBold,
      color: primaryColor,
    });

    y -= 20;
    drawLine(y + 5);
    y -= 20;

    const terms = [
      "• This agreement represents a binding contract between the Investor and Farmer.",
      "• The Investor agrees to provide the specified investment amount to the Farmer.",
      "• The Farmer agrees to utilize the investment for agricultural purposes as described in the listing.",
      "• Returns on investment will be distributed according to the terms outlined in the listing.",
      "• Either party may initiate a dispute through the Agri-Share platform within 30 days.",
      "• This contract is governed by the laws of Ethiopia.",
    ];

    for (const term of terms) {
      page.drawText(term, {
        x: leftMargin + 10,
        y: y,
        size: 9,
        font: font,
        color: textColor,
        maxWidth: 480,
      });
      y -= 14;
    }

    y -= 15;

    // Signature Section
    drawLine(y + 10);
    y -= 15;

    // Two column signatures
    // Investor Signature
    page.drawText("INVESTOR:", {
      x: leftMargin,
      y: y,
      size: 10,
      font: fontBold,
      color: textColor,
    });

    page.drawLine({
      start: { x: leftMargin, y: y - 5 },
      end: { x: leftMargin + 180, y: y - 5 },
      thickness: 1,
      color: textColor,
    });
    page.drawText("Signature", {
      x: leftMargin + 70,
      y: y - 18,
      size: 8,
      font: font,
      color: secondaryColor,
    });

    page.drawLine({
      start: { x: leftMargin, y: y - 25 },
      end: { x: leftMargin + 180, y: y - 25 },
      thickness: 1,
      color: textColor,
    });
    page.drawText("Printed Name", {
      x: leftMargin + 55,
      y: y - 38,
      size: 8,
      font: font,
      color: secondaryColor,
    });

    page.drawLine({
      start: { x: leftMargin, y: y - 45 },
      end: { x: leftMargin + 180, y: y - 45 },
      thickness: 1,
      color: textColor,
    });
    page.drawText("Date", {
      x: leftMargin + 75,
      y: y - 58,
      size: 8,
      font: font,
      color: secondaryColor,
    });

    // Farmer Signature
    page.drawText("FARMER:", {
      x: rightColumn,
      y: y,
      size: 10,
      font: fontBold,
      color: textColor,
    });

    page.drawLine({
      start: { x: rightColumn, y: y - 5 },
      end: { x: rightColumn + 180, y: y - 5 },
      thickness: 1,
      color: textColor,
    });
    page.drawText("Signature", {
      x: rightColumn + 70,
      y: y - 18,
      size: 8,
      font: font,
      color: secondaryColor,
    });

    page.drawLine({
      start: { x: rightColumn, y: y - 25 },
      end: { x: rightColumn + 180, y: y - 25 },
      thickness: 1,
      color: textColor,
    });
    page.drawText("Printed Name", {
      x: rightColumn + 55,
      y: y - 38,
      size: 8,
      font: font,
      color: secondaryColor,
    });

    page.drawLine({
      start: { x: rightColumn, y: y - 45 },
      end: { x: rightColumn + 180, y: y - 45 },
      thickness: 1,
      color: textColor,
    });
    page.drawText("Date", {
      x: rightColumn + 75,
      y: y - 58,
      size: 8,
      font: font,
      color: secondaryColor,
    });

    y -= 80;

    // Footer
    // const footerY = 10;
    // drawLine(footerY + 10);

    // page.drawText(
    //   "This contract is electronically generated and valid without physical signatures.",
    //   {
    //     x: leftMargin,
    //     y: footerY,
    //     size: 8,
    //     font: fontOblique,
    //     color: secondaryColor,
    //   },
    // );

    // page.drawText(
    //   `Document ID: ${investment._id || "N/A"} • Generated: ${new Date().toLocaleString()}`,
    //   {
    //     x: leftMargin,
    //     y: footerY - 12,
    //     size: 7,
    //     font: font,
    //     color: secondaryColor,
    //   },
    // );

    // Save the PDF
    const pdfBytes = await pdfDoc.save();

    // Send response
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=contract_${investment.contractNumber || investment._id}.pdf`,
    );
    res.send(Buffer.from(pdfBytes));
  } catch (error) {
    console.error("Error generating PDF:", error);
    res.status(500).json({
      error: "Failed to generate PDF",
      details: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

export default router;
